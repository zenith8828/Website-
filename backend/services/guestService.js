"use strict";

const {
  GUEST_MATCH_LIMIT
} = require("../config/constants");

// Temporary in-memory guest match tracking.
// Later this can be moved to Redis/database.
const guestMatches = new Map();

function getGuestMatchCount(guestId) {
  if (!guestId) {
    throw new Error("Guest ID is required.");
  }

  return guestMatches.get(guestId) || 0;
}

function canGuestStartMatch(guestId) {
  return (
    getGuestMatchCount(guestId) <
    GUEST_MATCH_LIMIT
  );
}

function recordGuestMatch(guestId) {
  if (!guestId) {
    throw new Error("Guest ID is required.");
  }

  const currentCount =
    getGuestMatchCount(guestId);

  if (currentCount >= GUEST_MATCH_LIMIT) {
    return {
      allowed: false,
      matchCount: currentCount,
      remaining: 0
    };
  }

  const newCount = currentCount + 1;

  guestMatches.set(
    guestId,
    newCount
  );

  return {
    allowed: true,
    matchCount: newCount,
    remaining:
      GUEST_MATCH_LIMIT - newCount
  };
}

function resetGuestMatches(guestId) {
  if (!guestId) {
    return false;
  }

  return guestMatches.delete(guestId);
}

function getGuestStatus(guestId) {
  const count =
    getGuestMatchCount(guestId);

  return {
    guestId,
    matchCount: count,
    limit: GUEST_MATCH_LIMIT,
    remaining:
      Math.max(
        GUEST_MATCH_LIMIT - count,
        0
      ),
    canStart:
      count < GUEST_MATCH_LIMIT
  };
}

module.exports = {
  getGuestMatchCount,
  canGuestStartMatch,
  recordGuestMatch,
  resetGuestMatches,
  getGuestStatus
};
