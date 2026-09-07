"use strict";

/*
 * =========================================
 * VizoChat Like System
 *
 * Rules:
 * - 1 Like per chat
 * - Like starts a 10-second validation timer
 * - Receiver must remain connected for 10 seconds
 * - Valid Like = 2 Coins
 * - Coins are awarded only once
 * =========================================
 */


// =========================================
// API
// =========================================

const LIKE_API =
  window.VizoAuth?.VIZOCHAT_API ||
  "https://website-r746.onrender.com/api";

const LIKE_VALIDATION_SECONDS = 10;


// =========================================
// STATE
// =========================================

let likeSentThisMatch = false;
let currentLikeId = null;

let validationTimer = null;
let countdownTimer = null;

let validationEndTime = null;


// =========================================
// DOM
// =========================================

const likeButton =
  document.getElementById("likeButton");


// =========================================
// TIMER UI
// =========================================

function getTimerElement() {
  let timer =
    document.getElementById(
      "likeValidationTimer"
    );

  if (timer) {
    return timer;
  }

  /*
   * Create timer automatically so
   * chat.html does not need another
   * mandatory element.
   */

  const chatArea =
    document.querySelector(
      ".video-area"
    ) ||
    document.querySelector(
      ".chat-area"
    ) ||
    document.querySelector(
      "main"
    );

  if (!chatArea) {
    return null;
  }

  timer =
    document.createElement("div");

  timer.id =
    "likeValidationTimer";

  timer.setAttribute(
    "role",
    "status"
  );

  timer.setAttribute(
    "aria-live",
    "polite"
  );

  timer.style.position =
    "absolute";

  timer.style.top =
    "14px";

  timer.style.left =
    "14px";

  timer.style.zIndex =
    "50";

  timer.style.display =
    "none";

  timer.style.padding =
    "8px 12px";

  timer.style.borderRadius =
    "10px";

  timer.style.background =
    "rgba(0, 0, 0, 0.72)";

  timer.style.color =
    "#ffffff";

  timer.style.fontSize =
    "13px";

  timer.style.fontWeight =
    "600";

  timer.style.backdropFilter =
    "blur(8px)";

  timer.style.webkitBackdropFilter =
    "blur(8px)";

  chatArea.appendChild(timer);

  return timer;
}


// =========================================
// SHOW TIMER
// =========================================

function showLikeTimer(seconds) {
  const timer =
    getTimerElement();

  if (!timer) {
    return;
  }

  const safeSeconds =
    Math.max(
      0,
      Math.ceil(seconds)
    );

  timer.textContent =
    `❤️ Like validating • ${safeSeconds}s`;

  timer.style.display =
    "block";
}


// =========================================
// HIDE TIMER
// =========================================

function hideLikeTimer() {
  const timer =
    document.getElementById(
      "likeValidationTimer"
    );

  if (!timer) {
    return;
  }

  timer.style.display =
    "none";
}


// =========================================
// START COUNTDOWN
// =========================================

function startLikeCountdown(
  seconds = LIKE_VALIDATION_SECONDS
) {
  stopLikeCountdown();

  validationEndTime =
    Date.now() +
    seconds * 1000;

  showLikeTimer(seconds);

  countdownTimer =
    setInterval(() => {

      const remaining =
        Math.max(
          0,
          (
            validationEndTime -
            Date.now()
          ) / 1000
        );

      if (remaining <= 0) {
        showLikeTimer(0);
        stopLikeCountdown();
        return;
      }

      showLikeTimer(
        Math.ceil(remaining)
      );

    }, 250);
}


// =========================================
// STOP COUNTDOWN
// =========================================

function stopLikeCountdown() {
  if (countdownTimer) {
    clearInterval(
      countdownTimer
    );

    countdownTimer = null;
  }

  validationEndTime = null;
}


// =========================================
// RESET LIKE
// =========================================

function resetLikeForNewMatch() {
  likeSentThisMatch = false;

  currentLikeId = null;

  stopLikeValidation();

  stopLikeCountdown();

  hideLikeTimer();

  if (likeButton) {
    likeButton.disabled = false;
    likeButton.textContent =
      "Like";
  }
}


// =========================================
// SEND LIKE
// =========================================

async function sendLike() {

  if (likeSentThisMatch) {
    return;
  }

  if (!window.VizoChat) {
    return;
  }


  const senderId =
    window.VizoAuth?.getUserId
      ? window.VizoAuth.getUserId()
      : null;


  const receiverId =
    window.VizoChat
      .getCurrentPartnerId();


  const matchId =
    window.VizoChat
      .getCurrentMatchId();


  if (
    !senderId ||
    !receiverId ||
    !matchId
  ) {
    alert(
      "Please connect with someone first."
    );

    return;
  }


  try {

    likeSentThisMatch = true;


    if (likeButton) {
      likeButton.disabled = true;
      likeButton.textContent =
        "Sending...";
    }


    const headers =
      window.VizoAuth?.getAuthHeaders
        ? window.VizoAuth.getAuthHeaders()
        : {
            "Content-Type":
              "application/json"
          };


    const response =
      await fetch(
        `${LIKE_API}/likes`,
        {
          method: "POST",

          headers,

          body: JSON.stringify({
            senderId,
            receiverId,
            matchId
          })
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.message ||
        "Unable to send Like."
      );
    }


    currentLikeId =
      data.likeId ||
      data.like?.id ||
      data.id ||
      null;


    if (!currentLikeId) {
      throw new Error(
        "Like ID was not returned by server."
      );
    }


    if (likeButton) {
      likeButton.textContent =
        "Liked ❤️";
    }


    /*
     * Start the visible 10-second
     * countdown immediately.
     */
    startLikeCountdown(
      data.secondsRemaining ||
      LIKE_VALIDATION_SECONDS
    );


    /*
     * Tell backend that receiver
     * is connected and begin validation.
     */
    await markReceiverConnected(
      currentLikeId
    );


    startLikeValidation(
      currentLikeId
    );


  } catch (error) {

    console.error(
      "Like error:",
      error
    );


    likeSentThisMatch = false;

    currentLikeId = null;


    stopLikeValidation();

    stopLikeCountdown();

    hideLikeTimer();


    if (likeButton) {
      likeButton.disabled = false;
      likeButton.textContent =
        "Like";
    }


    alert(
      error.message ||
      "Unable to send Like."
    );
  }
}


// =========================================
// MARK RECEIVER CONNECTED
// =========================================

async function markReceiverConnected(
  likeId
) {
  if (!likeId) {
    return null;
  }


  const headers =
    window.VizoAuth?.getAuthHeaders
      ? window.VizoAuth.getAuthHeaders()
      : {
          "Content-Type":
            "application/json"
        };


  const response =
    await fetch(
      `${LIKE_API}/likes/${encodeURIComponent(
        likeId
      )}/receiver-connected`,
      {
        method: "POST",
        headers
      }
    );


  const data =
    await response.json();


  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.message ||
      "Unable to start Like validation."
    );
  }


  return data;
}


// =========================================
// CHECK LIKE STATUS
// =========================================

async function checkLikeValidation(
  likeId
) {
  if (!likeId) {
    return;
  }


  try {

    const headers =
      window.VizoAuth?.getAuthHeaders
        ? window.VizoAuth.getAuthHeaders()
        : {
            "Content-Type":
              "application/json"
          };


    const response =
      await fetch(
        `${LIKE_API}/likes/${encodeURIComponent(
          likeId
        )}`,
        {
          method: "GET",
          headers
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.success
    ) {
      return;
    }


    const like =
      data.like || data;


    if (!like) {
      return;
    }


    // =====================================
    // VALID
    // =====================================

    if (
      like.status === "valid"
    ) {

      stopLikeValidation();

      stopLikeCountdown();

      hideLikeTimer();


      if (likeButton) {
        likeButton.textContent =
          "Liked ✓";

        likeButton.disabled =
          true;
      }


      console.log(
        `Valid Like: +${like.coins || 2} Coins`
      );


      return;
    }


    // =====================================
    // INVALID
    // =====================================

    if (
      like.status === "invalid"
    ) {

      stopLikeValidation();

      stopLikeCountdown();

      hideLikeTimer();


      if (likeButton) {
        likeButton.textContent =
          "Like";

        likeButton.disabled =
          true;
      }


      console.log(
        "Like became invalid:",
        like.invalidReason ||
        "Receiver was not connected."
      );


      return;
    }


    // =====================================
    // PENDING
    // =====================================

    if (
      like.status === "pending"
    ) {

      if (
        like.secondsRemaining !==
        undefined
      ) {

        showLikeTimer(
          like.secondsRemaining
        );

      }


      /*
       * Once server says 0 seconds,
       * ask server to validate.
       */

      if (
        like.secondsRemaining <= 0
      ) {

        await validateLikeOnServer(
          likeId
        );
      }
    }

  } catch (error) {

    console.error(
      "Like status error:",
      error
    );
  }
}


// =========================================
// VALIDATE LIKE ON SERVER
// =========================================

async function validateLikeOnServer(
  likeId
) {
  if (!likeId) {
    return;
  }


  try {

    const headers =
      window.VizoAuth?.getAuthHeaders
        ? window.VizoAuth.getAuthHeaders()
        : {
            "Content-Type":
              "application/json"
          };


    const response =
      await fetch(
        `${LIKE_API}/likes/${encodeURIComponent(
          likeId
        )}/validate`,
        {
          method: "POST",

          headers,

          body: JSON.stringify({
            receiverStillConnected:
              true
          })
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.success
    ) {
      return;
    }


    if (
      data.status === "valid"
    ) {

      stopLikeValidation();

      stopLikeCountdown();

      hideLikeTimer();


      if (likeButton) {
        likeButton.textContent =
          "Liked ✓";

        likeButton.disabled =
          true;
      }


      console.log(
        `Valid Like: +${data.coins || 2} Coins`
      );


      return;
    }


    if (
      data.status === "invalid"
    ) {

      stopLikeValidation();

      stopLikeCountdown();

      hideLikeTimer();


      if (likeButton) {
        likeButton.textContent =
          "Like";

        likeButton.disabled =
          true;
      }


      return;
    }


    /*
     * Still pending.
     */
    if (
      data.secondsRemaining !==
      undefined
    ) {

      startLikeCountdown(
        data.secondsRemaining
      );
    }

  } catch (error) {

    console.error(
      "Server validation error:",
      error
    );
  }
}


// =========================================
// START VALIDATION POLLING
// =========================================

function startLikeValidation(
  likeId
) {
  stopLikeValidation();


  /*
   * Check immediately.
   */
  checkLikeValidation(
    likeId
  );


  /*
   * Continue checking every 1 second
   * so the timer/validation stays accurate.
   */
  validationTimer =
    setInterval(() => {

      /*
       * Stop checking if this is
       * no longer the current Like.
       */
      if (
        currentLikeId !== likeId
      ) {
        stopLikeValidation();
        return;
      }


      checkLikeValidation(
        likeId
      );

    }, 1000);
}


// =========================================
// STOP VALIDATION
// =========================================

function stopLikeValidation() {
  if (validationTimer) {

    clearInterval(
      validationTimer
    );

    validationTimer = null;
  }
}


// =========================================
// LIKE BUTTON
// =========================================

if (likeButton) {

  likeButton.addEventListener(
    "click",
    sendLike
  );
}


// =========================================
// DETECT NEW MATCH
// =========================================

let lastMatchId = null;

setInterval(() => {

  if (!window.VizoChat) {
    return;
  }


  const matchId =
    window.VizoChat
      .getCurrentMatchId();


  if (
    matchId &&
    matchId !== lastMatchId
  ) {

    lastMatchId =
      matchId;

    resetLikeForNewMatch();

    return;
  }


  if (!matchId) {

    lastMatchId =
      null;
  }

}, 500);


// =========================================
// GLOBAL LIKE API
// =========================================

window.VizoLike = {

  sendLike,

  resetLikeForNewMatch,

  checkLikeValidation,

  validateLikeOnServer,

  markReceiverConnected

};
