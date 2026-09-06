"use strict";

const {
  LIKE_VALUE_RUPEES
} = require("../config/constants");

const USER_STATUS = {
  ACTIVE: "active",
  BANNED: "banned"
};

const users = new Map();

function createUser({
  id,
  googleId = null,
  name = "VizoChat User",
  email = null,
  photo = null
}) {
  if (!id) {
    throw new Error("User ID is required.");
  }

  if (users.has(id)) {
    return users.get(id);
  }

  const user = {
    id,
    googleId,
    name,
    email,
    photo,

    validLikes: 0,
    totalEarnings: 0,

    status: USER_STATUS.ACTIVE,
    bannedUntil: null,

    createdAt: new Date(),
    updatedAt: new Date()
  };

  users.set(id, user);

  return user;
}

function getUserById(userId) {
  if (!userId) {
    return null;
  }

  return users.get(userId) || null;
}

function getUserByGoogleId(googleId) {
  if (!googleId) {
    return null;
  }

  for (const user of users.values()) {
    if (user.googleId === googleId) {
      return user;
    }
  }

  return null;
}

function getUserByEmail(email) {
  if (!email) {
    return null;
  }

  for (const user of users.values()) {
    if (user.email === email) {
      return user;
    }
  }

  return null;
}

function getAllUsers() {
  return Array.from(users.values());
}

function addValidLike(userId) {
  const user = getUserById(userId);

  if (!user) {
    throw new Error("User not found.");
  }

  user.validLikes += 1;
  user.totalEarnings += LIKE_VALUE_RUPEES;
  user.updatedAt = new Date();

  return user;
}

function isUserBanned(userId) {
  const user = getUserById(userId);

  if (!user) {
    return false;
  }

  if (user.status !== USER_STATUS.BANNED) {
    return false;
  }

  if (user.bannedUntil && new Date() >= new Date(user.bannedUntil)) {
    user.status = USER_STATUS.ACTIVE;
    user.bannedUntil = null;
    user.updatedAt = new Date();

    return false;
  }

  return true;
}

function canUserAccess(userId) {
  return !isUserBanned(userId);
}

function banUser(userId, days = 23) {
  const user = getUserById(userId);

  if (!user) {
    throw new Error("User not found.");
  }

  const bannedUntil = new Date();
  bannedUntil.setDate(bannedUntil.getDate() + days);

  user.status = USER_STATUS.BANNED;
  user.bannedUntil = bannedUntil;
  user.updatedAt = new Date();

  return user;
}

function unbanUser(userId) {
  const user = getUserById(userId);

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
  getUserById,
  getUserByGoogleId,
  getUserByEmail,
  getAllUsers,
  addValidLike,
  isUserBanned,
  canUserAccess,
  banUser,
  unbanUser
};
