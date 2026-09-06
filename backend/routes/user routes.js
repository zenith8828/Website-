"use strict";

const express = require("express");

const {
  createUser,
  canUserAccess,
  isUserBanned
} = require("../models/user");

const router = express.Router();

// Get user by ID
router.get("/:userId", (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required."
      });
    }

    const user = createUser({
      id: userId,
      name: "VizoChat User",
      email: "",
      photo: ""
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        validLikes: user.validLikes,
        totalEarnings: user.totalEarnings,
        status: user.status,
        bannedUntil: user.bannedUntil
      }
    });
  } catch (error) {
    console.error("Get user error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get user."
    });
  }
});

// Check whether user can access VizoChat
router.get("/:userId/access", (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required."
      });
    }

    return res.json({
      success: true,
      userId,
      canAccess: canUserAccess(userId),
      isBanned: isUserBanned(userId)
    });
  } catch (error) {
    console.error("User access error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check user access."
    });
  }
});

module.exports = router;
