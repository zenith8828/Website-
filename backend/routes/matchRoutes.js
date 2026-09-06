"use strict";

const express = require("express");

const {
  createMatch,
  connectUser,
  endMatch,
  isUserInMatch,
  getOtherUserId
} = require("../models/match");

const router = express.Router();

// Create a new match
router.post("/", (req, res) => {
  try {
    const { matchId, userAId, userBId } = req.body;

    if (!matchId || !userAId || !userBId) {
      return res.status(400).json({
        success: false,
        message: "matchId, userAId and userBId are required."
      });
    }

    if (userAId === userBId) {
      return res.status(400).json({
        success: false,
        message: "A user cannot be matched with themselves."
      });
    }

    const match = createMatch({
      id: matchId,
      userAId,
      userBId
    });

    return res.status(201).json({
      success: true,
      match
    });
  } catch (error) {
    console.error("Create match error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to create match."
    });
  }
});

// Connect a user to a match
router.post("/:matchId/connect", (req, res) => {
  try {
    const { matchId } = req.params;
    const { userId } = req.body;

    if (!matchId || !userId) {
      return res.status(400).json({
        success: false,
        message: "matchId and userId are required."
      });
    }

    const match = connectUser(matchId, userId);

    return res.json({
      success: true,
      message: "User connected to match.",
      match
    });
  } catch (error) {
    console.error("Connect match error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to connect user."
    });
  }
});

// End a match
router.post("/:matchId/end", (req, res) => {
  try {
    const { matchId } = req.params;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: "Match ID is required."
      });
    }

    const match = endMatch(matchId);

    return res.json({
      success: true,
      message: "Match ended.",
      match
    });
  } catch (error) {
    console.error("End match error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to end match."
    });
  }
});

// Check whether user is inside a match
router.get("/:matchId/user/:userId", (req, res) => {
  try {
    const { matchId, userId } = req.params;

    const inMatch = isUserInMatch(matchId, userId);

    return res.json({
      success: true,
      matchId,
      userId,
      inMatch
    });
  } catch (error) {
    console.error("Match status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check match status."
    });
  }
});

// Get the other participant
router.get("/:matchId/other/:userId", (req, res) => {
  try {
    const { matchId, userId } = req.params;

    const otherUserId = getOtherUserId(matchId, userId);

    if (!otherUserId) {
      return res.status(404).json({
        success: false,
        message: "Other user not found."
      });
    }

    return res.json({
      success: true,
      matchId,
      userId,
      otherUserId
    });
  } catch (error) {
    console.error("Other user error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to find other user."
    });
  }
});

module.exports = router;
