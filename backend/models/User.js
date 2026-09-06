"use strict";

/*
 * VizoChat User Model
 *
 * This model describes the user data that will be stored
 * by the backend/database.
 *
 * Important:
 * Likes and earnings must be calculated and verified
 * by the backend, never trusted from the frontend.
 */

const USER_STATUS = {
  ACTIVE: "active",
  BANNED: "banned"
};


function createUser({
  id,
  googleId = null,
  name = "VizoChat User",
  email = "",
  photo = ""
} = {}) {

  if (!id) {
    throw new Error("User ID is required.");
  }


  return {
    id: String(id),

    googleId:
      googleId ? String(googleId) : null,

    name:
      String(name).trim() || "VizoChat User",

    email:
      String(email).trim().toLowerCase(),

    photo:
      String(photo).trim(),

    validLikes: 0,

    totalEarnings: 0,

    status: USER_STATUS.ACTIVE,

    bannedUntil: null,

    createdAt: new Date(),

    updatedAt: new Date()
  };
}


/**
 * Check whether a user is currently banned.
 */
function isUserBanned(user) {

  if (!user) {
    return false;
  }


  if (user.status !== USER_STATUS.BANNED) {
    return false;
  }


  if (!user.bannedUntil) {
    return true;
  }


  return new Date(user.bannedUntil) > new Date();
}


/**
 * Check whether a user can use VizoChat.
 */
function canUserAccess(user) {

  if (!user) {
    return false;
  }


  return !isUserBanned(user);
}


/**
 * Add a valid Like to a user.
 *
 * The actual validation of the Like will happen
 * in the Like service/backend.
 */
function addValidLike(user, likeValue) {

  if (!user) {
    throw new Error("User not found.");
  }


  if (typeof likeValue !== "number" ||
      !Number.isFinite(likeValue) ||
      likeValue <= 0) {

    throw new Error("Invalid Like value.");
  }


  user.validLikes += 1;

  user.totalEarnings += likeValue;

  user.updatedAt = new Date();


  return user;
}


/**
 * Ban a user.
 */
function banUser(user, bannedUntil) {

  if (!user) {
    throw new Error("User not found.");
  }


  user.status = USER_STATUS.BANNED;

  user.bannedUntil =
    bannedUntil
      ? new Date(bannedUntil)
      : null;

  user.updatedAt = new Date();


  return user;
}


/**
 * Unban a user.
 */
function unbanUser(user) {

  if (!user) {
    throw new Error("User not found.");
  }


  user.status = USER_STATUS.ACTIVE;

  user.bannedUntil = null;

  user.updatedAt = new Date();


  return user;
}


module.exports = {
  USER_STATUS,
  createUser,
  isUserBanned,
  canUserAccess,
  addValidLike,
  banUser,
  unbanUser
};
