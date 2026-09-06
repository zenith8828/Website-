"use strict";

/*
 * VizoChat Database Configuration
 *
 * This file prepares the database connection layer.
 * DATABASE_URL will be provided through the .env file.
 */

const DATABASE_URL =
  process.env.DATABASE_URL || "";


/**
 * Check database configuration.
 */
function isDatabaseConfigured() {
  return DATABASE_URL.trim().length > 0;
}


/**
 * Get database connection URL.
 *
 * The actual database driver will be connected
 * after we finalize the production database.
 */
function getDatabaseUrl() {

  if (!isDatabaseConfigured()) {
    return null;
  }

  return DATABASE_URL;
}


/**
 * Database status.
 */
function getDatabaseStatus() {

  return {
    configured: isDatabaseConfigured(),
    connected: false
  };

}


module.exports = {
  isDatabaseConfigured,
  getDatabaseUrl,
  getDatabaseStatus
};
