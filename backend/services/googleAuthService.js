"use strict";

const crypto = require("crypto");
const {
  createUser
} = require("../models/user");

function generateUserId() {
  return `user_${Date.now()}_${crypto
    .randomBytes(6)
    .toString("hex")}`;
}

async function exchangeGoogleCode(code) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error(
      "Google authentication is not configured."
    );
  }

  if (!code) {
    throw new Error(
      "Google authorization code is required."
    );
  }

  const tokenResponse = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code"
      })
    }
  );

  if (!tokenResponse.ok) {
    throw new Error(
      "Unable to exchange Google authorization code."
    );
  }

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    throw new Error(
      "Google access token was not returned."
    );
  }

  return tokenData;
}

async function getGoogleUser(accessToken) {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      "Unable to get Google user information."
    );
  }

  const googleUser = await response.json();

  if (!googleUser.sub || !googleUser.email) {
    throw new Error(
      "Google account information is incomplete."
    );
  }

  return googleUser;
}

async function loginWithGoogle(code) {
  const tokenData = await exchangeGoogleCode(code);

  const googleUser = await getGoogleUser(
    tokenData.access_token
  );

  const user = createUser({
    id: generateUserId(),
    googleId: googleUser.sub,
    name:
      googleUser.name ||
      googleUser.email.split("@")[0],
    email: googleUser.email,
    photo: googleUser.picture || ""
  });

  return {
    user,
    accessToken: tokenData.access_token
  };
}

module.exports = {
  exchangeGoogleCode,
  getGoogleUser,
  loginWithGoogle
};
