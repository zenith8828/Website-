"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { getPublicProfile } = require("../services/userService");

const router = express.Router();

// Get logged-in user's profile
router.get("/", requireAuth, (req, res) => {
  try {
    const profile = getPublicProfile(req.userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found."
      });
    }

    return res.json({
      success: true,
      profile
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
