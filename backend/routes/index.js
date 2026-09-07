"use strict";

const express = require("express");

const healthRoutes = require("./healthRoutes");
const likeRoutes = require("./likeRoutes");
const reportRoutes = require("./reportRoutes");
const userRoutes = require("./userRoutes");
const matchRoutes = require("./matchRoutes");

const router = express.Router();


// ========================================
// HEALTH
// ========================================

router.use("/health", healthRoutes);


// ========================================
// AUTH
// ========================================

router.use("/auth", userRoutes);


// ========================================
// LIKES
// ========================================

router.use("/likes", likeRoutes);


// ========================================
// REPORTS
// ========================================

router.use("/reports", reportRoutes);


// ========================================
// USERS
// ========================================

router.use("/users", userRoutes);


// ========================================
// MATCHES
// ========================================

router.use("/matches", matchRoutes);


module.exports = router;
