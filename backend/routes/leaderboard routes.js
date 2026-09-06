"use strict";

const express = require("express");

const {
  LEADERBOARD_LIMIT
} = require("../config/constants");

const router = express.Router();

// Temporary leaderboard data.
// Database connect होने के बाद यही data database से आएगा.
const users = new Map();

// Add/update user for leaderboard
function addUser(user) {
  if (!user || !user.id) {
    return;
  }

  users.set(user.id, user);
}

// Get Top 20 users
router.get("/", (req, res) => {
  try {
    const leaderboard = Array.from(users.values())
      .filter((user) => user.status !== "banned")
      .sort((a, b) => {
        return (
          Number(b.validLikes || 0) -
          Number(a.validLikes || 0)
        );
      })
      .slice(0, LEADERBOARD_LIMIT)
      .map((user, index) => ({
        rank: index + 1,
        id: user.id,
        name: user.name || "VizoChat User",
        photo: user.photo || "",
        validLikes: Number(user.validLikes || 0)
      }));

    return res.json({
      success: true,
      limit: LEADERBOARD_LIMIT,
      leaderboard
    });
  } catch (error) {
    console.error(
      "Leaderboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load leaderboard."
    });
  }
});

module.exports = {
  router,
  addUser
};
