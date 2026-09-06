"use strict";

const express = require("express");

const {
  createNewMatch,
  connectUsers,
  endUsersMatch,
  checkUserInMatch,
  getMatchedUser
} = require("../services/matchService");

const router = express.Router();

// Create a new match
router.post("/", (req, res) => {
  try {
    const { user1Id, user2Id } = req.body;

    const match = createNewMatch(user1Id, user2Id);

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

// Connect users to a match
router.post("/:matchId/connect", (req, res) => {
  try {
    const match = connectUsers(req.params.matchId);

    return res.json({
      success: true,
      match
    });
  } catch (error) {
    console.error("Connect match error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to connect match."
    });
  }
});

// End a match
router.post("/:matchId/end", (req, res) => {
  try {
    const match = endUsersMatch(req.params.matchId);

    return res.json({
      success: true,
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

// Check whether user is in a match
router.get("/:matchId/user/:userId", (req, res) => {
  try {
    const { matchId, userId } = req.params;

    const inMatch = checkUserInMatch(matchId, userId);

    return res.json({
      success: true,
      matchId,
      userId,
      inMatch
    });
  } catch (error) {
    console.error("Match check error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check match."
    });
  }
});

// Get the other user in a match
router.get("/:matchId/other/:userId", (req, res) => {
  try {
    const { matchId, userId } = req.params;

    const otherUserId = getMatchedUser(matchId, userId);

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

    return res.status(500).json({
      success: false,
      message: "Unable to find other user."
    });
  }
});

module.exports = router;
