"use strict";

const express = require("express");

const healthRoutes = require("./healthRoutes");
const likeRoutes = require("./likeRoutes");
const reportRoutes = require("./reportRoutes");
const userRoutes = require("./userRoutes");
const matchRoutes = require("./matchRoutes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/likes", likeRoutes);
router.use("/reports", reportRoutes);
router.use("/users", userRoutes);
router.use("/matches", matchRoutes);

module.exports = router;
