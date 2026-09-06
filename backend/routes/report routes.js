"use strict";

const express = require("express");

const {
  createUserReport,
  getReportCountLastHour
} = require("../services/reportService");

const router = express.Router();

// Create a report
router.post("/", (req, res) => {
  try {
    const {
      matchId,
      reporterId,
      reportedUserId,
      reason
    } = req.body;

    const result = createUserReport({
      matchId,
      reporterId,
      reportedUserId,
      reason
    });

    return res.status(201).json({
      success: true,
      message: result.banApplied
        ? "Report submitted. User has been automatically banned."
        : "Report submitted successfully.",
      report: result.report,
      banApplied: result.banApplied,
      bannedUntil: result.bannedUntil
    });
  } catch (error) {
    console.error("Create report error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to submit report."
    });
  }
});

// Get report count for the last hour
router.get("/count/:userId", (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required."
      });
    }

    const count = getReportCountLastHour(userId);

    return res.json({
      success: true,
      userId,
      reportsLastHour: count
    });
  } catch (error) {
    console.error("Report count error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get report count."
    });
  }
});

module.exports = router;
