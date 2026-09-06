"use strict";

const crypto = require("crypto");

const {
  REPORT_WINDOW_MINUTES,
  REPORT_BAN_LIMIT,
  AUTOMATIC_BAN_DAYS
} = require("../config/constants");

const {
  getUserById,
  banUser
} = require("../models/user");

const reports = new Map();

function createUserReport({
  reporterId,
  reportedUserId,
  matchId = null,
  reason = "Other"
}) {
  if (!reporterId || !reportedUserId) {
    throw new Error(
      "Reporter and reported user IDs are required."
    );
  }

  if (reporterId === reportedUserId) {
    throw new Error(
      "A user cannot report themselves."
    );
  }

  const reportedUser = getUserById(reportedUserId);

  if (!reportedUser) {
    throw new Error(
      "Reported user not found."
    );
  }

  const reportId = crypto.randomUUID();

  const report = {
    id: reportId,
    reporterId,
    reportedUserId,
    matchId,
    reason,
    status: "active",
    createdAt: new Date(),
    processedAt: null
  };

  reports.set(reportId, report);

  const banResult = checkAndApplyAutomaticBan(
    reportedUserId
  );

  return {
    report,
    automaticBan: banResult
  };
}

function getRecentReportsForUser(userId) {
  const now = Date.now();

  const windowMs =
    REPORT_WINDOW_MINUTES * 60 * 1000;

  return Array.from(reports.values()).filter(
    (report) => {
      if (report.reportedUserId !== userId) {
        return false;
      }

      const reportTime =
        new Date(report.createdAt).getTime();

      return now - reportTime <= windowMs;
    }
  );
}

function getReportCountForUser(userId) {
  return getRecentReportsForUser(userId).length;
}

function checkAndApplyAutomaticBan(userId) {
  const recentReports =
    getRecentReportsForUser(userId);

  if (recentReports.length < REPORT_BAN_LIMIT) {
    return {
      banned: false,
      reportCount: recentReports.length
    };
  }

  const user = getUserById(userId);

  if (!user) {
    return {
      banned: false,
      reportCount: recentReports.length
    };
  }

  const alreadyBanned =
    user.status === "banned" &&
    user.bannedUntil &&
    new Date() < new Date(user.bannedUntil);

  if (!alreadyBanned) {
    banUser(
      userId,
      AUTOMATIC_BAN_DAYS
    );
  }

  for (const report of recentReports) {
    report.status = "processed";
    report.processedAt = new Date();
  }

  return {
    banned: true,
    reportCount: recentReports.length,
    banDays: AUTOMATIC_BAN_DAYS,
    bannedUntil:
      getUserById(userId)?.bannedUntil || null
  };
}

function getReportById(reportId) {
  return reports.get(reportId) || null;
}

function getAllReports() {
  return Array.from(reports.values());
}

function processReport(reportId) {
  const report = reports.get(reportId);

  if (!report) {
    return null;
  }

  report.status = "processed";
  report.processedAt = new Date();

  return report;
}

function cleanupOldReports() {
  const now = Date.now();

  const windowMs =
    REPORT_WINDOW_MINUTES * 60 * 1000;

  for (const [reportId, report] of reports.entries()) {
    const reportTime =
      new Date(report.createdAt).getTime();

    if (now - reportTime > windowMs) {
      reports.delete(reportId);
    }
  }
}

module.exports = {
  createUserReport,
  getRecentReportsForUser,
  getReportCountForUser,
  checkAndApplyAutomaticBan,
  getReportById,
  getAllReports,
  processReport,
  cleanupOldReports
};
