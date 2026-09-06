"use strict";

const express = require("express");

const {
  loginWithGoogle
} = require("../services/googleAuthService");

const {
  createSession,
  deleteSession
} = require("../services/sessionService");

const router = express.Router();

// Start Google Login
router.get("/google", (req, res) => {
  try {
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

    googleUrl.searchParams.set("client_id", clientId);
    googleUrl.searchParams.set("redirect_uri", callbackUrl);
    googleUrl.searchParams.set("response_type", "code");

    googleUrl.searchParams.set(
      "scope",
      "openid email profile"
    );

    googleUrl.searchParams.set("access_type", "offline");
    googleUrl.searchParams.set("prompt", "select_account");

    return res.redirect(googleUrl.toString());
  } catch (error) {
    console.error("Google login start error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to start Google login."
    });
  }
});

// Google Login Callback
router.get("/google/callback", async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Google login was cancelled or failed.",
        error
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Google authorization code is missing."
      });
    }

    const result = await loginWithGoogle(code);

    const session = createSession(result.user.id);

    return res.json({
      success: true,
      message: "Google login successful.",
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        photo: result.user.photo,
        validLikes: result.user.validLikes,
        totalEarnings: result.user.totalEarnings
      }
    });
  } catch (error) {
    console.error("Google callback error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Google login failed."
    });
  }
});

// Logout
router.post("/logout", (req, res) => {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.json({
        success: true,
        message: "Already logged out."
      });
    }

    const token = authorization.slice(7).trim();

    if (token) {
      deleteSession(token);
    }

    return res.json({
      success: true,
      message: "Logged out successfully."
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to logout."
    });
  }
});

module.exports = router;
