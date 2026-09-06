"use strict";

const express = require("express");

const {
  createUserReport,
  getRecentReportsForUser,
  getReportCountForUser
} = require("../services/reportService");

const router = express.Router();

// Create a report
router.post("/", (req, res) => {
  try {
    const {
      reporterId,
      reportedUserId,
      matchId = null,
      reason = "Other"
    } = req.body;

    if (!reporterId || !reportedUserId) {
      return res.status(400).json({
        success: false,
        message: "Reporter ID and reported user ID are required."
      });
    }

    const result = createUserReport({
      reporterId,
      reportedUserId,
      matchId,
      reason
    });

    return res.status(201).json({
      success: true,
      message: result.banned
        ? "Report submitted. User has been automatically banned for 23 days."
        : "Report submitted successfully.",
      report: result.report,
      banned: result.banned,
      bannedUntil: result.bannedUntil || null,
      reportCount: result.reportCount
    });
  } catch (error) {
    console.error("Report creation error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to submit report."
    });
  }
});

// Get report count for a user in the last 1 hour
router.get("/count/:userId", (req, res) => {
  try {
    const { userId } = req.params;

    const reportCount = getReportCountForUser(userId);

    return res.json({
      success: true,
      userId,
      reportCount,
      windowMinutes: 60,
      automaticBanLimit: 5,
      automaticBanDays: 23
    });
  } catch (error) {
    console.error("Report count error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get report count."
    });
  }
});

// Get recent reports for a user
router.get("/recent/:userId", (req, res) => {
  try {
    const { userId } = req.params;

    const reports = getRecentReportsForUser(userId);

    return res.json({
      success: true,
      userId,
      reports
    });
  } catch (error) {
    console.error("Recent reports error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to get recent reports."
    });
  }
});

module.exports = router;
