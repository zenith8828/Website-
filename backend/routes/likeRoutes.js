"use strict";

const express = require("express");

const {
  createPendingLike,
  markReceiverConnected,
  validateLike,
  getLikeById,
  getLikeEarning,
  hasLikeForMatch
} = require("../services/likeService");

const router = express.Router();


// ========================================
// SEND LIKE
// ========================================

router.post("/", (req, res) => {
  try {
    const {
      senderId,
      receiverId,
      matchId
    } = req.body;

    if (
      !senderId ||
      !receiverId ||
      !matchId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "senderId, receiverId and matchId are required."
      });
    }


    // Only one Like is allowed per chat
    if (hasLikeForMatch(matchId)) {
      return res.status(409).json({
        success: false,
        message:
          "Only one Like is allowed in this chat."
      });
    }


    const like = createPendingLike({
      senderId,
      receiverId,
      matchId
    });


    return res.status(201).json({
      success: true,

      message:
        "Like received. The 10-second validation timer has started.",

      likeId: like.id,

      status: like.status,

      coins: 0,

      secondsRemaining: 10
    });

  } catch (error) {

    console.error(
      "Create Like error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to send Like."
    });
  }
});


// ========================================
// MARK RECEIVER CONNECTED
// ========================================

router.post(
  "/:likeId/receiver-connected",
  (req, res) => {

    try {

      const like =
        markReceiverConnected(
          req.params.likeId
        );


      if (!like) {
        return res.status(404).json({
          success: false,
          message:
            "Like not found."
        });
      }


      return res.json({
        success: true,

        likeId: like.id,

        status: like.status,

        receiverConnectedAt:
          like.receiverConnectedAt,

        secondsRemaining:
          like.status === "pending"
            ? 10
            : 0
      });

    } catch (error) {

      console.error(
        "Receiver connection error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Unable to update receiver connection."
      });
    }
  }
);


// ========================================
// VALIDATE LIKE
// ========================================

router.post(
  "/:likeId/validate",
  (req, res) => {

    try {

      const {
        receiverStillConnected
      } = req.body;


      const like =
        validateLike(
          req.params.likeId,
          receiverStillConnected === true
        );


      const isValid =
        like.status === "valid";


      return res.json({
        success: true,

        likeId: like.id,

        status: like.status,

        coins:
          isValid
            ? getLikeEarning(like.id)
            : 0,

        secondsRemaining:
          like.secondsRemaining || 0,

        validatedAt:
          like.validatedAt || null
      });

    } catch (error) {

      console.error(
        "Like validation error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Unable to validate Like."
      });
    }
  }
);


// ========================================
// GET LIKE STATUS
// ========================================

router.get(
  "/:likeId",
  (req, res) => {

    try {

      const like =
        getLikeById(
          req.params.likeId
        );


      if (!like) {
        return res.status(404).json({
          success: false,
          message:
            "Like not found."
        });
      }


      const isValid =
        like.status === "valid";


      return res.json({
        success: true,

        like: {
          id: like.id,

          senderId:
            like.senderId,

          receiverId:
            like.receiverId,

          matchId:
            like.matchId,

          status:
            like.status,

          coins:
            isValid
              ? getLikeEarning(like.id)
              : 0,

          secondsRemaining:
            like.secondsRemaining || 0,

          createdAt:
            like.createdAt,

          receiverConnectedAt:
            like.receiverConnectedAt || null,

          validatedAt:
            like.validatedAt || null
        }
      });

    } catch (error) {

      console.error(
        "Get Like error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to get Like status."
      });
    }
  }
);


module.exports = router;
