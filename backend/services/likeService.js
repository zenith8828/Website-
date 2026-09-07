"use strict";

const crypto = require("crypto");

const {
  LIKE_VALUE_COINS,
  LIKE_VALIDATION_SECONDS
} = require("../config/constants");

const {
  getUserById,
  addValidLike
} = require("../models/user");

const likes = new Map();


// ========================================
// CREATE PENDING LIKE
// ========================================

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

  // Only one Like is allowed per chat
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

    // Starts when receiver connection is
    // confirmed for this Like.
    receiverConnectedAt: null,

    validatedAt: null,

    coins: 0,

    updatedAt: new Date()
  };

  likes.set(likeId, like);

  return like;
}


// ========================================
// MARK RECEIVER CONNECTED
// ========================================

function markReceiverConnected(likeId) {
  const like = likes.get(likeId);

  if (!like) {
    return null;
  }

  if (like.status !== "pending") {
    return like;
  }

  /*
   * IMPORTANT:
   * Do NOT reset this timestamp every time
   * the endpoint is called.
   *
   * The 10-second timer starts only once.
   */
  if (!like.receiverConnectedAt) {
    like.receiverConnectedAt = new Date();
    like.updatedAt = new Date();
  }

  return like;
}


// ========================================
// VALIDATE LIKE
// ========================================

function validateLike(
  likeId,
  receiverStillConnected = false
) {
  const like = likes.get(likeId);

  if (!like) {
    throw new Error("Like not found.");
  }

  /*
   * Prevent duplicate validation/reward.
   */
  if (like.status !== "pending") {
    return like;
  }

  /*
   * Receiver must still be connected.
   */
  if (!receiverStillConnected) {
    like.status = "invalid";

    like.invalidReason =
      "Receiver was not connected.";

    like.updatedAt = new Date();

    return like;
  }

  /*
   * Make sure the timer has started.
   */
  if (!like.receiverConnectedAt) {
    like.receiverConnectedAt = new Date();
    like.updatedAt = new Date();

    return {
      ...like,
      status: "pending",
      secondsRemaining:
        LIKE_VALIDATION_SECONDS
    };
  }

  const now = Date.now();

  const connectedAt =
    new Date(
      like.receiverConnectedAt
    ).getTime();

  const elapsedSeconds =
    (now - connectedAt) / 1000;


  /*
   * 10-second validation period
   */
  if (
    elapsedSeconds <
    LIKE_VALIDATION_SECONDS
  ) {
    return {
      ...like,
      status: "pending",
      secondsRemaining: Math.max(
        0,
        Math.ceil(
          LIKE_VALIDATION_SECONDS -
          elapsedSeconds
        )
      )
    };
  }


  // ======================================
  // RECEIVER CHECK
  // ======================================

  const receiver =
    getUserById(like.receiverId);

  if (!receiver) {
    like.status = "invalid";

    like.invalidReason =
      "Receiver user not found.";

    like.updatedAt = new Date();

    return like;
  }


  // ======================================
  // ADD VALID LIKE + COINS
  // ======================================

  addValidLike(
    like.receiverId
  );


  like.status = "valid";

  like.validatedAt = new Date();

  // 1 Valid Like = 2 Coins
  like.coins = LIKE_VALUE_COINS;

  like.updatedAt = new Date();


  return like;
}


// ========================================
// GET LIKE
// ========================================

function getLikeById(likeId) {
  return likes.get(likeId) || null;
}


// ========================================
// GET LIKE COINS
// ========================================

function getLikeEarning(likeId) {
  const like = getLikeById(likeId);

  if (
    !like ||
    like.status !== "valid"
  ) {
    return 0;
  }

  return LIKE_VALUE_COINS;
}


// ========================================
// CHECK LIKE FOR MATCH
// ========================================

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


// ========================================
// GET LIKE FOR MATCH
// ========================================

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


// ========================================
// EXPORTS
// ========================================

module.exports = {
  createPendingLike,
  markReceiverConnected,
  validateLike,
  getLikeById,
  getLikeEarning,
  hasLikeForMatch,
  getLikeForMatch
};
