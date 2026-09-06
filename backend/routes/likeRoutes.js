"use strict";

const express = require("express");

const {
  createPendingLike,
  validateLike,
  getLikeById
} = require("../services/likeService");

const router = express.Router();

// Send Like
router.post("/", (req, res) => {
  try {
    const {
      matchId,
      senderId,
      receiverId
    } = req.body;

    const like = createPendingLike({
      matchId,
      senderId,
      receiverId
    });

    return res.status(201).json({
      success: true,
      message: "Like received. Validation started.",
      likeId: like.id,
      status: like.status
    });
  } catch (error) {
    console.error("Create Like error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to send Like."
    });
  }
});

// Validate Like after receiver stays connected for 10 seconds
router.post("/:likeId/validate", (req, res) => {
  try {
    const { likeId } = req.params;
    const { receiverStillConnected } = req.body;

    if (!likeId) {
      return res.status(400).json({
        success: false,
        message: "Like ID is required."
      });
    }

    const like = getLikeById(likeId);

    if (!like) {
      return res.status(404).json({
        success: false,
        message: "Like not found."
      });
    }

    const result = validateLike({
      likeId,
      receiverStillConnected: receiverStillConnected === true
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("Validate Like error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to validate Like."
    });
  }
});

module.exports = router;
