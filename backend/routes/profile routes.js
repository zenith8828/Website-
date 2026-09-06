"use strict";

const express = require("express");

const {
  requireAuth
} = require("../middleware/authMiddleware");

const {
  createUser
} = require("../models/user");

const router = express.Router();

// Get logged-in user's profile
router.get("/", requireAuth, (req, res) => {
  try {
    const user = createUser({
      id: req.userId
    });

    return res.json({
      success: true,
      profile: {
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
    console.error("Profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load profile."
    });
  }
});

module.exports = router;
