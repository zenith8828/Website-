"use strict";

/*
 * VizoChat Report Model
 *
 * Rules:
 * - Reports are associated with a chat match.
 * - Reports are counted within a 1-hour window.
 * - 5 reports within 1 hour can trigger a 23-day ban.
 * - Final ban decision will be handled by the backend service.
 */

const REPORT_STATUS = {
  ACTIVE: "active",
  PROCESSED: "processed"
};


/**
 * Create a report.
 */
function createReport({
  id,
  matchId,
  reporterId,
  reportedUserId,
  reason = ""
} = {}) {

  if (!id) {
    throw new Error("Report ID is required.");
  }

  if (!matchId) {
    throw new Error("Match ID is required.");
  }

  if (!reporterId) {
    throw new Error("Reporter ID is required.");
  }

  if (!reportedUserId) {
    throw new Error("Reported user ID is required.");
  }

  if (
    String(reporterId) ===
    String(reportedUserId)
  ) {
    throw new Error(
      "A user cannot report themselves."
    );
  }


  return {
    id: String(id),

    matchId: String(matchId),

    reporterId: String(reporterId),

    reportedUserId:
      String(reportedUserId),

    reason:
      String(reason).trim(),

    status:
      REPORT_STATUS.ACTIVE,

    createdAt: new Date(),

    processedAt: null
  };
}


/**
 * Mark a report as processed.
 */
function markReportProcessed(report) {

  if (!report) {
    throw new Error("Report not found.");
  }

  report.status =
    REPORT_STATUS.PROCESSED;

  report.processedAt =
    new Date();

  return report;
}


/**
 * Check whether report is active.
 */
function isActiveReport(report) {

  return Boolean(
    report &&
    report.status ===
      REPORT_STATUS.ACTIVE
  );

}


/**
 * Check whether report falls inside
 * the specified time window.
 */
function isWithinTimeWindow(
  report,
  windowStart
) {

  if (!report || !report.createdAt) {
    return false;
  }

  const reportTime =
    new Date(report.createdAt).getTime();

  const startTime =
    new Date(windowStart).getTime();

  if (
    !Number.isFinite(reportTime) ||
    !Number.isFinite(startTime)
  ) {
    return false;
  }

  return reportTime >= startTime;
}


module.exports = {
  REPORT_STATUS,
  createReport,
  markReportProcessed,
  isActiveReport,
  isWithinTimeWindow
};
