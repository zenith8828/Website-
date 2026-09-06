"use strict";

/*
 * VizoChat Like Model
 *
 * Rules:
 * - One Like maximum per chat session.
 * - A Like is initially pending.
 * - Receiver must remain connected for 10 seconds.
 * - Only a valid Like generates ₹2 earnings.
 */

const LIKE_STATUS = {
  PENDING: "pending",
  VALID: "valid",
  INVALID: "invalid"
};


/**
 * Create a Like record.
 */
function createLike({
  id,
  matchId,
  senderId,
  receiverId
} = {}) {

  if (!id) {
    throw new Error("Like ID is required.");
  }

  if (!matchId) {
    throw new Error("Match ID is required.");
  }

  if (!senderId) {
    throw new Error("Sender ID is required.");
  }

  if (!receiverId) {
    throw new Error("Receiver ID is required.");
  }

  if (String(senderId) === String(receiverId)) {
    throw new Error("A user cannot Like themselves.");
  }


  return {
    id: String(id),

    matchId: String(matchId),

    senderId: String(senderId),

    receiverId: String(receiverId),

    status: LIKE_STATUS.PENDING,

    sentAt: new Date(),

    validAt: null,

    invalidAt: null
  };
}


/**
 * Mark Like as valid.
 */
function markLikeValid(like) {

  if (!like) {
    throw new Error("Like not found.");
  }

  if (like.status !== LIKE_STATUS.PENDING) {
    return like;
  }

  like.status = LIKE_STATUS.VALID;

  like.validAt = new Date();

  return like;
}


/**
 * Mark Like as invalid.
 */
function markLikeInvalid(like) {

  if (!like) {
    throw new Error("Like not found.");
  }

  if (like.status !== LIKE_STATUS.PENDING) {
    return like;
  }

  like.status = LIKE_STATUS.INVALID;

  like.invalidAt = new Date();

  return like;
}


/**
 * Check whether Like is valid.
 */
function isValidLike(like) {

  return Boolean(
    like &&
    like.status === LIKE_STATUS.VALID
  );

}


module.exports = {
  LIKE_STATUS,
  createLike,
  markLikeValid,
  markLikeInvalid,
  isValidLike
};
