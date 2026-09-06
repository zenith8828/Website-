"use strict";

const {
  getUserById,
  getAllUsers
} = require("../models/user");

// Get public profile
function getPublicProfile(userId) {
  const user = getUserById(userId);

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    name: user.name,
    photo: user.photo,
    email: user.email,
    validLikes: user.validLikes,
    totalEarnings: user.totalEarnings
  };
}

// Get basic user information for admin
function getUserDetails(userId) {
  const user = getUserById(userId);

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    googleId: user.googleId,
    name: user.name,
    email: user.email,
    photo: user.photo,
    validLikes: user.validLikes,
    totalEarnings: user.totalEarnings,
    status: user.status,
    bannedUntil: user.bannedUntil,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

// Get all users
function getAllUserDetails() {
  return getAllUsers().map((user) => ({
    userId: user.id,
    name: user.name,
    email: user.email,
    photo: user.photo,
    validLikes: user.validLikes,
    totalEarnings: user.totalEarnings,
    status: user.status,
    bannedUntil: user.bannedUntil,
    createdAt: user.createdAt
  }));
}

// Check whether user is banned
function checkUserBanned(userId) {
  const user = getUserById(userId);

  if (!user) {
    return {
      exists: false,
      banned: false
    };
  }

  if (user.status !== "banned") {
    return {
      exists: true,
      banned: false
    };
  }

  if (
    user.bannedUntil &&
    new Date() >= new Date(user.bannedUntil)
  ) {
    user.status = "active";
    user.bannedUntil = null;
    user.updatedAt = new Date();

    return {
      exists: true,
      banned: false
    };
  }

  return {
    exists: true,
    banned: true,
    bannedUntil: user.bannedUntil
  };
}

// Check whether user can use VizoChat
function checkUserAccess(userId) {
  const result = checkUserBanned(userId);

  if (!result.exists) {
    return {
      allowed: false,
      reason: "User not found."
    };
  }

  if (result.banned) {
    return {
      allowed: false,
      reason: "User is banned.",
      bannedUntil: result.bannedUntil
    };
  }

  return {
    allowed: true,
    reason: null
  };
}

module.exports = {
  getPublicProfile,
  getUserDetails,
  getAllUserDetails,
  checkUserBanned,
  checkUserAccess
};
