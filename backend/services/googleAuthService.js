"use strict";

const crypto = require("crypto");

const {
  createUser,
  getUserByGoogleId,
  getUserByEmail
} = require("../models/user");


async function loginWithGoogle(code) {

  if (!code) {
    throw new Error("Google authorization code is required.");
  }

  const clientId =
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET;

  const callbackUrl =
    process.env.GOOGLE_CALLBACK_URL;


  if (
    !clientId ||
    !clientSecret ||
    !callbackUrl
  ) {
    throw new Error(
      "Google authentication is not configured."
    );
  }


  // ================================
  // EXCHANGE CODE FOR GOOGLE TOKENS
  // ================================

  const tokenResponse =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: callbackUrl,
            grant_type:
              "authorization_code"
          })
      }
    );


  const tokenData =
    await tokenResponse.json();


  if (
    !tokenResponse.ok ||
    !tokenData.access_token
  ) {

    console.error(
      "Google token error:",
      tokenData
    );

    throw new Error(
      tokenData.error_description ||
      "Unable to authenticate with Google."
    );
  }


  // ================================
  // GET GOOGLE USER INFORMATION
  // ================================

  const userResponse =
    await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${tokenData.access_token}`
        }
      }
    );


  const googleUser =
    await userResponse.json();


  if (
    !userResponse.ok ||
    !googleUser.sub
  ) {

    console.error(
      "Google user info error:",
      googleUser
    );

    throw new Error(
      "Unable to get Google account information."
    );
  }


  const googleId =
    googleUser.sub;

  const email =
    googleUser.email || null;

  const name =
    googleUser.name ||
    "VizoChat User";

  const photo =
    googleUser.picture || null;


  // ================================
  // FIND EXISTING USER
  // ================================

  let user =
    getUserByGoogleId(googleId);


  // If Google ID was not found,
  // try email.

  if (!user && email) {
    user =
      getUserByEmail(email);
  }


  // ================================
  // UPDATE EXISTING USER
  // ================================

  if (user) {

    user.googleId =
      googleId;

    user.name =
      name;

    user.email =
      email;

    user.photo =
      photo;

    user.updatedAt =
      new Date();

    return user;
  }


  // ================================
  // CREATE NEW USER
  // ================================

  const userId =
    crypto.randomUUID();


  user =
    createUser({
      id: userId,
      googleId,
      name,
      email,
      photo
    });


  return user;
}


module.exports = {
  loginWithGoogle
};
