"use strict";

const {
  createUser,
  addValidLike,
  banUser,
  unbanUser,
  isUserBanned,
  canUserAccess
} = require("../models/user");

// Create or return a user
function createOrGetUser(userData = {}) {
  if (!userData.id) {
    throw new Error("User ID is required.");
  }

  return createUser({
    id: userData.id,
    googleId: userData.googleId || null,
    name: userData.name || "VizoChat User",
    email: userData.email || null,
    photo: userData.photo || null
  });
}

// Get basic user information
function getUser(userId) {
  if (!userId) {
    return null;
  }

  return createUser({
    id: userId
  });
}

// Add a valid Like and update earnings
function addLikeToUser(userId) {
  if (!userId) {
    throw new Error("Receiver user ID is required.");
  }

  return addValidLike(userId);
}

// Ban user
function banUserAccount(userId, days = 23) {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  return banUser(userId, days);
}

// Unban user
function unbanUserAccount(userId) {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  return unbanUser(userId);
}

// Check whether user is banned
function checkUserBanned(userId) {
  return isUserBanned(userId);
}

// Check whether user can access VizoChat
function checkUserAccess(userId) {
  return canUserAccess(userId);
}

// Return safe public profile data
function getPublicProfile(userId) {
  const user = getUser(userId);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    photo: user.photo,
    validLikes: user.validLikes,
    totalEarnings: user.totalEarnings,
    status: user.status,
    bannedUntil: user.bannedUntil
  };
}

module.exports = {
  createOrGetUser,
  getUser,
  addLikeToUser,
  banUserAccount,
  unbanUserAccount,
  checkUserBanned,
  checkUserAccess,
  getPublicProfile
};
