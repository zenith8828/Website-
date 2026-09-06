"use strict";

const {
  createMatch,
  connectMatch,
  endMatch,
  isUserInMatch,
  getOtherUserId
} = require("../models/match");

// Create a new match between two users
function createNewMatch(user1Id, user2Id) {
  if (!user1Id || !user2Id) {
    throw new Error("Both user IDs are required.");
  }

  if (user1Id === user2Id) {
    throw new Error("A user cannot be matched with themselves.");
  }

  return createMatch(user1Id, user2Id);
}

// Mark a match as connected
function connectUsers(matchId) {
  if (!matchId) {
    throw new Error("Match ID is required.");
  }

  return connectMatch(matchId);
}

// End an active match
function endUsersMatch(matchId) {
  if (!matchId) {
    throw new Error("Match ID is required.");
  }

  return endMatch(matchId);
}

// Check whether a user is currently in a match
function checkUserInMatch(matchId, userId) {
  if (!matchId || !userId) {
    return false;
  }

  return isUserInMatch(matchId, userId);
}

// Get the other participant in a match
function getMatchedUser(matchId, userId) {
  if (!matchId || !userId) {
    return null;
  }

  return getOtherUserId(matchId, userId);
}

module.exports = {
  createNewMatch,
  connectUsers,
  endUsersMatch,
  checkUserInMatch,
  getMatchedUser
};
