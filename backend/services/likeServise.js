"use strict";

const crypto = require("crypto");

const {
  LIKE_VALUE_RUPEES,
  LIKE_VALIDATION_SECONDS
} = require("../config/constants");

const {
  getUserById,
  addValidLike
} = require("../models/user");

const likes = new Map();

function createPendingLike({
  senderId,
  receiverId,
  matchId
}) {
  if (!senderId || !receiverId || !matchId) {
    throw new Error(
      "Sender, receiver and match ID are required."
    );
  }

  if (senderId === receiverId) {
    throw new Error(
      "A user cannot like themselves."
    );
  }

  if (hasLikeForMatch(matchId)) {
    throw new Error(
      "Only one Like is allowed in this chat."
    );
  }

  const receiver = getUserById(receiverId);

  if (!receiver) {
    throw new Error(
      "Receiver user not found."
    );
  }

  const likeId = crypto.randomUUID();

  const like = {
    id: likeId,
    senderId,
    receiverId,
    matchId,

    status: "pending",

    createdAt: new Date(),
    receiverConnectedAt: null,
    validatedAt: null
  };

  likes.set(likeId, like);

  return like;
}

// Mark the time when receiver is still connected
function markReceiverConnected(likeId) {
  const like = likes.get(likeId);

  if (!like) {
    return null;
  }

  if (like.status !== "pending") {
    return like;
  }

  like.receiverConnectedAt = new Date();

  return like;
}

// Validate Like after receiver stays connected
function validateLike(
  likeId,
  receiverStillConnected = false
) {
  const like = likes.get(likeId);

  if (!like) {
    throw new Error("Like not found.");
  }

  if (like.status !== "pending") {
    return like;
  }

  if (!receiverStillConnected) {
    like.status = "invalid";
    like.invalidReason =
      "Receiver was not connected.";
    like.updatedAt = new Date();

    return like;
  }

  const now = Date.now();

  const connectedAt =
    like.receiverConnectedAt
      ? new Date(like.receiverConnectedAt).getTime()
      : new Date(like.createdAt).getTime();

  const elapsedSeconds =
    (now - connectedAt) / 1000;

  if (elapsedSeconds < LIKE_VALIDATION_SECONDS) {
    return {
      ...like,
      status: "pending",
      secondsRemaining: Math.ceil(
        LIKE_VALIDATION_SECONDS - elapsedSeconds
      )
    };
  }

  const receiver =
    getUserById(like.receiverId);

  if (!receiver) {
    like.status = "invalid";
    like.invalidReason =
      "Receiver user not found.";
    like.updatedAt = new Date();

    return like;
  }

  addValidLike(like.receiverId);

  like.status = "valid";
  like.validatedAt = new Date();
  like.earning = LIKE_VALUE_RUPEES;
  like.updatedAt = new Date();

  return like;
}

function getLikeById(likeId) {
  return likes.get(likeId) || null;
}

function getLikeEarning(likeId) {
  const like = getLikeById(likeId);

  if (!like || like.status !== "valid") {
    return 0;
  }

  return LIKE_VALUE_RUPEES;
}

// Check if any Like already exists for this match
function hasLikeForMatch(matchId) {
  if (!matchId) {
    return false;
  }

  for (const like of likes.values()) {
    if (like.matchId === matchId) {
      return true;
    }
  }

  return false;
}

// Get Like status for a match
function getLikeForMatch(matchId) {
  if (!matchId) {
    return null;
  }

  for (const like of likes.values()) {
    if (like.matchId === matchId) {
      return like;
    }
  }

  return null;
}

module.exports = {
  createPendingLike,
  markReceiverConnected,
  validateLike,
  getLikeById,
  getLikeEarning,
  hasLikeForMatch,
  getLikeForMatch
};
