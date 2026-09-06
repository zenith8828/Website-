"use strict";

const express = require("express");

const {
  createPendingLike,
  markReceiverConnected,
  validateLike,
  getLikeById,
  getLikeEarning,
  hasLikeForMatch
} = require("../services/likeService");

const router = express.Router();

// Send Like
router.post("/", (req, res) => {
  try {
    const {
      senderId,
      receiverId,
      matchId
    } = req.body;

    if (!senderId || !receiverId || !matchId) {
      return res.status(400).json({
        success: false,
        message:
          "senderId, receiverId and matchId are required."
      });
    }

    // Only one Like is allowed in one chat
    if (hasLikeForMatch(matchId)) {
      return res.status(409).json({
        success: false,
        message:
          "Only one Like is allowed in this chat."
      });
    }

    const like = createPendingLike({
      senderId,
      receiverId,
      matchId
    });

    return res.status(201).json({
      success: true,
      message:
        "Like received. It will become valid if the receiver stays connected for 10 seconds.",
      likeId: like.id,
      status: like.status
    });
  } catch (error) {
    console.error("Create Like error:", error);

    return res.status(400).json({
      success: false,
      message:
        error.message || "Unable to send Like."
    });
  }
});

// Mark receiver as connected
router.post("/:likeId/receiver-connected", (req, res) => {
  try {
    const like = markReceiverConnected(
      req.params.likeId
    );

    if (!like) {
      return res.status(404).json({
        success: false,
        message: "Like not found."
      });
    }

    return res.json({
      success: true,
      likeId: like.id,
      status: like.status,
      receiverConnectedAt:
        like.receiverConnectedAt
    });
  } catch (error) {
    console.error(
      "Receiver connection error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to update receiver connection."
    });
  }
});

// Validate Like
router.post("/:likeId/validate", (req, res) => {
  try {
    const {
      receiverStillConnected
    } = req.body;

    const like = validateLike(
      req.params.likeId,
      receiverStillConnected === true
    );

    return res.json({
      success: true,
      likeId: like.id,
      status: like.status,
      earning:
        like.status === "valid"
          ? getLikeEarning(like.id)
          : 0,
      secondsRemaining:
        like.secondsRemaining || 0
    });
  } catch (error) {
    console.error(
      "Like validation error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to validate Like."
    });
  }
});

// Get Like status
router.get("/:likeId", (req, res) => {
  try {
    const like = getLikeById(
      req.params.likeId
    );

    if (!like) {
      return res.status(404).json({
        success: false,
        message: "Like not found."
      });
    }

    return res.json({
      success: true,
      like: {
        id: like.id,
        senderId: like.senderId,
        receiverId: like.receiverId,
        matchId: like.matchId,
        status: like.status,
        earning:
          like.status === "valid"
            ? getLikeEarning(like.id)
            : 0,
        createdAt: like.createdAt,
        validatedAt:
          like.validatedAt || null
      }
    });
  } catch (error) {
    console.error(
      "Get Like error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to get Like status."
    });
  }
});

module.exports = router;
