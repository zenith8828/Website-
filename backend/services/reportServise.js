"use strict";

const {
  REPORT_WINDOW_MINUTES,
  REPORT_BAN_LIMIT,
  AUTOMATIC_BAN_DAYS
} = require("../config/constants");

const {
  createReport,
  markReportProcessed,
  isActiveReport,
  isWithinTimeWindow
} = require("../models/report");

const {
  banUser,
  isUserBanned
} = require("../models/user");

// Temporary in-memory storage.
// Later this will be replaced with database storage.
const reports = new Map();

function generateReportId() {
  return `report_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function createUserReport({
  matchId,
  reporterId,
  reportedUserId,
  reason = ""
}) {
  if (!matchId) {
    throw new Error("Match ID is required.");
  }

  if (!reporterId) {
    throw new Error("Reporter ID is required.");
  }

  if (!reportedUserId) {
    throw new Error("Reported user ID is required.");
  }

  if (reporterId === reportedUserId) {
    throw new Error("A user cannot report themselves.");
  }

  const reportId = generateReportId();

  const report = createReport({
    id: reportId,
    matchId,
    reporterId,
    reportedUserId,
    reason
  });

  reports.set(reportId, report);

  const banResult = checkAndApplyAutomaticBan(reportedUserId);

  return {
    report,
    banApplied: banResult.banned,
    bannedUntil: banResult.bannedUntil
  };
}

function getRecentReportsForUser(reportedUserId) {
  const now = Date.now();
  const windowMs = REPORT_WINDOW_MINUTES * 60 * 1000;

  const recentReports = [];

  for (const report of reports.values()) {
    if (!isActiveReport(report)) {
      continue;
    }

    if (report.reportedUserId !== reportedUserId) {
      continue;
    }

    const createdTime = new Date(report.createdAt).getTime();

    if (Number.isNaN(createdTime)) {
      continue;
    }

    if (now - createdTime <= windowMs) {
      recentReports.push(report);
    }
  }

  return recentReports;
}

function checkAndApplyAutomaticBan(reportedUserId) {
  const recentReports = getRecentReportsForUser(reportedUserId);

  if (recentReports.length < REPORT_BAN_LIMIT) {
    return {
      banned: false,
      bannedUntil: null,
      reportCount: recentReports.length
    };
  }

  const currentlyBanned = isUserBanned(reportedUserId);

  if (currentlyBanned) {
    return {
      banned: true,
      bannedUntil: null,
      reportCount: recentReports.length
    };
  }

  const bannedUntil = new Date(
    Date.now() + AUTOMATIC_BAN_DAYS * 24 * 60 * 60 * 1000
  );

  banUser(reportedUserId, bannedUntil);

  for (const report of recentReports) {
    markReportProcessed(report);
  }

  return {
    banned: true,
    bannedUntil,
    reportCount: recentReports.length
  };
}

function getReportCountLastHour(reportedUserId) {
  return getRecentReportsForUser(reportedUserId).length;
}

function getReportById(reportId) {
  return reports.get(reportId) || null;
}

function getAllReports() {
  return Array.from(reports.values());
}

function processReport(reportId) {
  const report = getReportById(reportId);

  if (!report) {
    throw new Error("Report not found.");
  }

  markReportProcessed(report);

  return report;
}

function cleanupOldReports() {
  const now = Date.now();
  const windowMs = REPORT_WINDOW_MINUTES * 60 * 1000;

  for (const [reportId, report] of reports.entries()) {
    const createdTime = new Date(report.createdAt).getTime();

    if (
      !Number.isNaN(createdTime) &&
      now - createdTime > windowMs
    ) {
      reports.delete(reportId);
    }
  }
}

module.exports = {
  createUserReport,
  checkAndApplyAutomaticBan,
  getReportCountLastHour,
  getReportById,
  getAllReports,
  processReport,
  cleanupOldReports
};
