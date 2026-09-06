"use strict";

/* =========================================
   VizoChat Like System
   1 Like per chat
   Receiver connected for 10 seconds = ₹2
========================================= */

const LIKE_API =
  window.VizoAuth?.VIZOCHAT_API ||
  "https://website-r746.onrender.com/api";

let likeSentThisMatch = false;
let currentLikeId = null;
let validationTimer = null;


/* =========================================
   DOM
========================================= */

const likeButton =
  document.getElementById("likeButton");


/* =========================================
   RESET LIKE
========================================= */

function resetLikeForNewMatch() {
  likeSentThisMatch = false;
  currentLikeId = null;

  if (validationTimer) {
    clearInterval(validationTimer);
    validationTimer = null;
  }

  if (likeButton) {
    likeButton.disabled = false;
    likeButton.textContent = "Like";
  }
}


/* =========================================
   SEND LIKE
========================================= */

async function sendLike() {
  if (likeSentThisMatch) {
    return;
  }

  if (!window.VizoChat) {
    return;
  }

  const senderId =
    window.VizoAuth?.getUserId();

  const receiverId =
    window.VizoChat.getCurrentPartnerId();

  const matchId =
    window.VizoChat.getCurrentMatchId();

  if (!senderId || !receiverId || !matchId) {
    alert(
      "Please connect with someone first."
    );
    return;
  }

  try {
    likeSentThisMatch = true;

    if (likeButton) {
      likeButton.disabled = true;
      likeButton.textContent = "Sending...";
    }

    const response =
      await fetch(
        `${LIKE_API}/likes`,
        {
          method: "POST",
          headers:
            window.VizoAuth?.getAuthHeaders
              ? window.VizoAuth.getAuthHeaders()
              : {
                  "Content-Type":
                    "application/json"
                },
          body: JSON.stringify({
            senderId,
            receiverId,
            matchId
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message ||
        "Unable to send Like."
      );
    }

    currentLikeId =
      data.like?.id ||
      data.likeId ||
      data.id ||
      null;

    if (likeButton) {
      likeButton.textContent =
        "Liked";
    }

    /*
      Start checking Like validation.
    */
    if (currentLikeId) {
      startLikeValidation(
        currentLikeId
      );
    }

  } catch (error) {
    console.error(
      "Like error:",
      error
    );

    likeSentThisMatch = false;

    if (likeButton) {
      likeButton.disabled = false;
      likeButton.textContent = "Like";
    }

    alert(
      error.message ||
      "Unable to send Like."
    );
  }
}


/* =========================================
   VALIDATE LIKE
========================================= */

async function checkLikeValidation(
  likeId
) {
  if (!likeId) return;

  try {
    /*
      Tell backend that receiver is connected.
    */
    await fetch(
      `${LIKE_API}/likes/${encodeURIComponent(
        likeId
      )}/receiver-connected`,
      {
        method: "POST",
        headers:
          window.VizoAuth?.getAuthHeaders
            ? window.VizoAuth.getAuthHeaders()
            : {
                "Content-Type":
                  "application/json"
              }
      }
    );

    /*
      Ask backend for validation status.
    */
    const response =
      await fetch(
        `${LIKE_API}/likes/${encodeURIComponent(
          likeId
        )}`,
        {
          method: "GET",
          headers:
            window.VizoAuth?.getAuthHeaders
              ? window.VizoAuth.getAuthHeaders()
              : {
                  "Content-Type":
                    "application/json"
                }
        }
      );

    const data =
      await response.json();

    const like =
      data.like || data;

    if (!like) return;

    if (like.status === "valid") {
      stopLikeValidation();

      if (likeButton) {
        likeButton.textContent =
          "Liked ✓";
        likeButton.disabled = true;
      }

      console.log(
        "Like valid. Receiver earned ₹2."
      );

      return;
    }

    if (like.status === "invalid") {
      stopLikeValidation();

      if (likeButton) {
        likeButton.textContent =
          "Like";
        likeButton.disabled = true;
      }

      console.log(
        "Like became invalid:",
        like.invalidReason
      );

      return;
    }

    /*
      After 10 seconds ask backend to
      validate the Like.
    */
    if (
      like.receiverConnectedAt
    ) {
      const connectedAt =
        new Date(
          like.receiverConnectedAt
        ).getTime();

      const elapsed =
        (Date.now() - connectedAt) /
        1000;

      if (elapsed >= 10) {
        await validateLikeOnServer(
          likeId
        );
      }
    }

  } catch (error) {
    console.error(
      "Like validation error:",
      error
    );
  }
}


/* =========================================
   SERVER VALIDATION
========================================= */

async function validateLikeOnServer(
  likeId
) {
  try {
    const response =
      await fetch(
        `${LIKE_API}/likes/${encodeURIComponent(
          likeId
        )}/validate`,
        {
          method: "POST",
          headers:
            window.VizoAuth?.getAuthHeaders
              ? window.VizoAuth.getAuthHeaders()
              : {
                  "Content-Type":
                    "application/json"
                },
          body: JSON.stringify({
            receiverStillConnected: true
          })
        }
      );

    const data =
      await response.json();

    const like =
      data.like || data;

    if (
      like &&
      like.status === "valid"
    ) {
      stopLikeValidation();

      if (likeButton) {
        likeButton.textContent =
          "Liked ✓";
      }

      console.log(
        "Valid Like: ₹2 added to receiver."
      );
    }

  } catch (error) {
    console.error(
      "Server validation error:",
      error
    );
  }
}


/* =========================================
   START VALIDATION POLLING
========================================= */

function startLikeValidation(
  likeId
) {
  stopLikeValidation();

  /*
    Check immediately.
  */
  checkLikeValidation(likeId);

  /*
    Continue checking every 2 seconds.
  */
  validationTimer =
    setInterval(() => {
      checkLikeValidation(likeId);
    }, 2000);
}


/* =========================================
   STOP VALIDATION
========================================= */

function stopLikeValidation() {
  if (validationTimer) {
    clearInterval(validationTimer);
    validationTimer = null;
  }
}


/* =========================================
   LIKE BUTTON
========================================= */

if (likeButton) {
  likeButton.addEventListener(
    "click",
    sendLike
  );
}


/* =========================================
   DETECT NEW MATCH
========================================= */

let lastMatchId = null;

setInterval(() => {
  if (!window.VizoChat) return;

  const matchId =
    window.VizoChat.getCurrentMatchId();

  if (
    matchId &&
    matchId !== lastMatchId
  ) {
    lastMatchId = matchId;

    resetLikeForNewMatch();
  }

  if (!matchId) {
    lastMatchId = null;
  }
}, 500);


/* =========================================
   GLOBAL LIKE API
========================================= */

window.VizoLike = {
  sendLike,
  resetLikeForNewMatch,
  checkLikeValidation,
  validateLikeOnServer
};
