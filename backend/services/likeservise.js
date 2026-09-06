"use strict";

const {
  LIKE_VALIDATION_SECONDS,
  LIKE_VALUE_RUPEES
} = require("../config/constants");

const {
  createLike,
  markLikeValid,
  markLikeInvalid,
  LIKE_STATUS
} = require("../models/like");


/*
 * Temporary in-memory storage.
 *
 * Later this will be replaced with the real database.
 */
const likes = new Map();


/**
 * Create a Like for a match.
 *
 * Only one Like is allowed for each
 * sender + match combination.
 */
function createPendingLike({
  matchId,
  senderId,
  receiverId
}) {

  if (!matchId) {
    throw new Error("Match ID is required.");
  }

  if (!senderId) {
    throw new Error("Sender ID is required.");
  }

  if (!receiverId) {
    throw new Error("Receiver ID is required.");
  }


  /*
   * Prevent duplicate Like from the same
   * user during the same chat session.
   */
  const existingLike =
    findLikeBySenderAndMatch(
      senderId,
      matchId
    );


  if (existingLike) {
    throw new Error(
      "You have already used your Like for this match."
    );
  }


  const id =
    `like_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;


  const like =
    createLike({
      id,
      matchId,
      senderId,
      receiverId
    });


  likes.set(
    like.id,
    like
  );


  return like;
}


/**
 * Validate a pending Like.
 *
 * The receiver must stay connected for
 * at least 10 seconds after the Like.
 */
function validateLike({
  likeId,
  receiverStillConnected
}) {

  const like =
    likes.get(likeId);


  if (!like) {
    throw new Error("Like not found.");
  }


  if (
    like.status !==
    LIKE_STATUS.PENDING
  ) {
    return like;
  }


  const now =
    Date.now();


  const sentAt =
    new Date(like.sentAt).getTime();


  const elapsedSeconds =
    (now - sentAt) / 1000;


  /*
   * Receiver must still be connected.
   */
  if (!receiverStillConnected) {

    markLikeInvalid(like);

    likes.set(
      like.id,
      like
    );

    return like;
  }


  /*
   * 10-second requirement.
   */
  if (
    elapsedSeconds <
    LIKE_VALIDATION_SECONDS
  ) {

    return {
      ...like,
      validationPending: true,
      remainingSeconds:
        Math.ceil(
          LIKE_VALIDATION_SECONDS -
          elapsedSeconds
        )
    };
  }


  /*
   * Like is now valid.
   */
  markLikeValid(like);

  likes.set(
    like.id,
    like
  );


  return like;
}


/**
 * Calculate earnings for a valid Like.
 */
function getLikeEarning(like) {

  if (
    !like ||
    like.status !==
      LIKE_STATUS.VALID
  ) {
    return 0;
  }


  return LIKE_VALUE_RUPEES;
}


/**
 * Find Like by ID.
 */
function getLikeById(likeId) {

  return likes.get(likeId) || null;

}


/**
 * Find Like created by a user
 * in a particular match.
 */
function findLikeBySenderAndMatch(
  senderId,
  matchId
) {

  for (const like of likes.values()) {

    if (
      like.senderId ===
        String(senderId) &&
      like.matchId ===
        String(matchId)
    ) {
      return like;
    }

  }


  return null;
}


/**
 * Check whether a match already has
 * any Like.
 *
 * This enforces the rule:
 * only ONE Like total per chat session.
 */
function hasLikeForMatch(matchId) {

  for (const like of likes.values()) {

    if (
      like.matchId ===
      String(matchId)
    ) {
      return true;
    }

  }


  return false;
}


/**
 * Get all stored Likes.
 *
 * Admin/backend use only.
 */
function getAllLikes() {

  return Array.from(
    likes.values()
  );

}


module.exports = {
  createPendingLike,
  validateLike,
  getLikeEarning,
  getLikeById,
  findLikeBySenderAndMatch,
  hasLikeForMatch,
  getAllLikes
};
