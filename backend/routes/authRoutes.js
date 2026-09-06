"use strict";

const express = require("express");

const router = express.Router();

// Google Login start
router.get("/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

  if (!clientId || !callbackUrl) {
    return res.status(503).json({
      success: false,
      message: "Google authentication is not configured yet."
    });
  }

  const googleUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth"
  );

  googleUrl.searchParams.set(
    "client_id",
    clientId
  );

  googleUrl.searchParams.set(
    "redirect_uri",
    callbackUrl
  );

  googleUrl.searchParams.set(
    "response_type",
    "code"
  );

  googleUrl.searchParams.set(
    "scope",
    "openid email profile"
  );

  googleUrl.searchParams.set(
    "access_type",
    "offline"
  );

  googleUrl.searchParams.set(
    "prompt",
    "select_account"
  );

  return res.redirect(
    googleUrl.toString()
  );
});

// Google callback
router.get("/google/callback", (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Google authentication was cancelled or failed."
    });
  }

  if (!code) {
    return res.status(400).json({
      success: false,
      message: "Google authorization code is missing."
    });
  }

  // Token exchange and user creation
  // will be connected in the next authentication step.

  return res.status(501).json({
    success: false,
    message: "Google callback is ready, but token exchange is not connected yet."
  });
});

// Logout placeholder
router.post("/logout", (req, res) => {
  return res.json({
    success: true,
    message: "Logout endpoint is ready."
  });
});

module.exports = router;
