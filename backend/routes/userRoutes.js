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


// ================================
// GOOGLE LOGIN
// ================================

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

    const googleUrl =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent("openid email profile")}` +
      `&access_type=offline` +
      `&prompt=select_account`;

    return res.redirect(googleUrl);

  } catch (error) {

    console.error("Google login start error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to start Google Login."
    });
  }
});


// ================================
// GOOGLE CALLBACK
// ================================

router.get("/google/callback", async (req, res) => {

  try {

    const {
      code,
      error
    } = req.query;


    if (error) {

      return res.redirect(
        getFrontendUrl() +
        "/login.html?error=" +
        encodeURIComponent(
          "Google Login was cancelled."
        )
      );
    }


    if (!code) {

      return res.redirect(
        getFrontendUrl() +
        "/login.html?error=" +
        encodeURIComponent(
          "Google authorization code is missing."
        )
      );
    }


    const user = await loginWithGoogle(code);

    const session = createSession(user.id);


    // Send token + basic user information
    // back to the frontend.

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      photo: user.photo
    };


    const redirectUrl =
      getFrontendUrl() +
      "/login.html" +
      "?token=" +
      encodeURIComponent(session.token) +
      "&user=" +
      encodeURIComponent(
        JSON.stringify(userData)
      );


    return res.redirect(redirectUrl);


  } catch (error) {

    console.error(
      "Google callback error:",
      error
    );


    return res.redirect(
      getFrontendUrl() +
      "/login.html?error=" +
      encodeURIComponent(
        error.message ||
        "Google Login failed."
      )
    );
  }
});


// ================================
// LOGOUT
// ================================

router.post("/logout", (req, res) => {

  try {

    const authorization =
      req.headers.authorization || "";


    if (
      !authorization.startsWith("Bearer ")
    ) {

      return res.status(400).json({
        success: false,
        message: "Authentication token is required."
      });
    }


    const token =
      authorization.substring(7).trim();


    if (!token) {

      return res.status(400).json({
        success: false,
        message: "Authentication token is required."
      });
    }


    const deleted =
      deleteSession(token);


    return res.json({
      success: true,
      message: deleted
        ? "Logged out successfully."
        : "Session already ended."
    });


  } catch (error) {

    console.error(
      "Logout error:",
      error
    );


    return res.status(500).json({
      success: false,
      message: "Unable to logout."
    });
  }
});


// ================================
// FRONTEND URL
// ================================

function getFrontendUrl() {

  return (
    process.env.FRONTEND_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}


module.exports = router;
