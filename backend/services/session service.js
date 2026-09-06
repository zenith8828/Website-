"use strict";

const crypto = require("crypto");

const sessions = new Map();

const SESSION_DURATION_MS =
  7 * 24 * 60 * 60 * 1000;

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createSession(userId) {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  const token = generateSessionToken();

  const session = {
    token,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(
      Date.now() + SESSION_DURATION_MS
    )
  };

  sessions.set(token, session);

  return session;
}

function getSession(token) {
  if (!token) {
    return null;
  }

  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (
    new Date(session.expiresAt).getTime() <=
    Date.now()
  ) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function deleteSession(token) {
  if (!token) {
    return false;
  }

  return sessions.delete(token);
}

function deleteUserSessions(userId) {
  if (!userId) {
    return 0;
  }

  let deleted = 0;

  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.delete(token);
      deleted++;
    }
  }

  return deleted;
}

function getSessionCount() {
  return sessions.size;
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  deleteUserSessions,
  getSessionCount
};
