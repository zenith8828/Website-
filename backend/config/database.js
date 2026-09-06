"use strict";

const DATABASE_URL = process.env.DATABASE_URL || "";

function isDatabaseConfigured() {
  return DATABASE_URL.trim().length > 0;
}

function getDatabaseUrl() {
  return DATABASE_URL;
}

function getDatabaseStatus() {
  return {
    configured: isDatabaseConfigured(),
    connected: false,
    message: isDatabaseConfigured()
      ? "Database URL is configured. Connection is not initialized yet."
      : "Database URL is not configured."
  };
}

module.exports = {
  isDatabaseConfigured,
  getDatabaseUrl,
  getDatabaseStatus
};
