"use strict";

const express = require("express");
const {
  getTopUsers,
  getUserRank
} = require("../services/leaderboardService");

const router = express.Router();

// Top 20 leaderboard
router.get("/", (req, res) => {
  try {
    const users = getTopUsers();

    return res.json({
      success: true,
      limit: 20,
      users
    });
  } catch (error) {
    console.error("Leaderboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load leaderboard."
    });
  }
});

// Get a user's rank
router.get("/rank/:userId", (req, res) => {
  try {
    const rank = getUserRank(req.params.userId);

    if (rank === null) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    return res.json({
      success: true,
      rank
    });
  } catch (error) {
    console.error("Rank error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get user rank."
    });
  }
});

module.exports = router;
