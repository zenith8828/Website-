"use strict";

const {
  getSession
} = require("../services/sessionService");

const {
  canUserAccess
} = require("../models/user");

function getTokenFromRequest(req) {
  const authorization =
    req.headers.authorization;

  if (!authorization) {
    return null;
  }

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.substring(7).trim();
}

function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Login required."
      });
    }

    const session = getSession(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Session expired or invalid."
      });
    }

    if (!canUserAccess(session.userId)) {
      return res.status(403).json({
        success: false,
        message: "Your account is currently banned."
      });
    }

    req.userId = session.userId;
    req.session = session;

    next();
  } catch (error) {
    console.error(
      "Authentication middleware error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Authentication check failed."
    });
  }
}

module.exports = {
  requireAuth,
  getTokenFromRequest
};
