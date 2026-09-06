"use strict";

const crypto = require("crypto");

const {
  createUser,
  getUserByGoogleId,
  getUserByEmail
} = require("../models/user");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

async function exchangeCodeForTokens(code) {
  if (!code) {
    throw new Error("Google authorization code is required.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth is not configured.");
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description ||
      data.error ||
      "Failed to exchange Google authorization code."
    );
  }

  return data;
}

async function getGoogleUserInfo(accessToken) {
  if (!accessToken) {
    throw new Error("Google access token is required.");
  }

  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Failed to get Google user information.");
  }

  if (!data.sub || !data.email) {
    throw new Error("Google account information is incomplete.");
  }

  return data;
}

async function loginWithGoogle(code) {
  const tokens = await exchangeCodeForTokens(code);

  const googleUser = await getGoogleUserInfo(tokens.access_token);

  // First find user by Google ID
  let user = getUserByGoogleId(googleUser.sub);

  // If Google ID is not found, try email
  if (!user && googleUser.email) {
    user = getUserByEmail(googleUser.email);
  }

  // Existing user
  if (user) {
    user.googleId = googleUser.sub;
    user.name = googleUser.name || user.name;
    user.email = googleUser.email || user.email;
    user.photo = googleUser.picture || user.photo;
    user.updatedAt = new Date();

    return {
      user,
      tokens
    };
  }

  // New user
  const userId = crypto.randomUUID();

  user = createUser({
    id: userId,
    googleId: googleUser.sub,
    name: googleUser.name || "VizoChat User",
    email: googleUser.email,
    photo: googleUser.picture || null
  });

  return {
    user,
    tokens
  };
}

module.exports = {
  exchangeCodeForTokens,
  getGoogleUserInfo,
  loginWithGoogle
};
