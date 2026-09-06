"use strict";

/*
 * VizoChat Match Model
 *
 * A match represents one 1-to-1 chat session.
 *
 * Video/audio media is NOT stored here.
 * WebRTC handles the P2P media connection.
 */

const MATCH_STATUS = {
  WAITING: "waiting",
  ACTIVE: "active",
  ENDED: "ended"
};


/**
 * Create a new match.
 */
function createMatch({
  id,
  userAId,
  userBId = null
} = {}) {

  if (!id) {
    throw new Error("Match ID is required.");
  }

  if (!userAId) {
    throw new Error("First user ID is required.");
  }

  return {
    id: String(id),

    userAId: String(userAId),

    userBId:
      userBId ? String(userBId) : null,

    status:
      userBId
        ? MATCH_STATUS.ACTIVE
        : MATCH_STATUS.WAITING,

    startedAt:
      userBId
        ? new Date()
        : null,

    endedAt: null,

    createdAt: new Date(),

    updatedAt: new Date()
  };
}


/**
 * Connect the second user to a waiting match.
 */
function connectUser(match, userBId) {

  if (!match) {
    throw new Error("Match not found.");
  }

  if (!userBId) {
    throw new Error("Second user ID is required.");
  }

  if (match.status !== MATCH_STATUS.WAITING) {
    throw new Error("Match is not waiting.");
  }

  match.userBId = String(userBId);

  match.status = MATCH_STATUS.ACTIVE;

  match.startedAt = new Date();

  match.updatedAt = new Date();

  return match;
}


/**
 * End a match.
 */
function endMatch(match) {

  if (!match) {
    throw new Error("Match not found.");
  }

  if (match.status === MATCH_STATUS.ENDED) {
    return match;
  }

  match.status = MATCH_STATUS.ENDED;

  match.endedAt = new Date();

  match.updatedAt = new Date();

  return match;
}


/**
 * Check whether a user belongs to a match.
 */
function isUserInMatch(match, userId) {

  if (!match || !userId) {
    return false;
  }

  const id = String(userId);

  return (
    match.userAId === id ||
    match.userBId === id
  );
}


/**
 * Get the other user in a match.
 */
function getOtherUserId(match, userId) {

  if (!isUserInMatch(match, userId)) {
    return null;
  }

  const id = String(userId);

  if (match.userAId === id) {
    return match.userBId;
  }

  return match.userAId;
}


module.exports = {
  MATCH_STATUS,
  createMatch,
  connectUser,
  endMatch,
  isUserInMatch,
  getOtherUserId
};
