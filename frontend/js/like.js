"use strict";

const LIKE_API_BASE =
  window.VizoAuth?.VIZOCHAT_API ||
  "http://localhost:5000/api";

let likeSentThisMatch = false;
let currentLikeId = null;

function getChatMatchId() {
  return window.VizoChat?.getCurrentMatchId?.() || null;
}

function getChatPartnerId() {
  return window.VizoChat?.getCurrentPartnerId?.() || null;
}

function getChatUserId() {
  return window.VizoAuth?.getUserId?.() || null;
}

function setLikeButtonState(disabled, text) {
  const button =
    document.getElementById("likeButton");

  if (!button) {
    return;
  }

  button.disabled = disabled;

  if (text) {
    button.textContent = text;
  }
}

function resetLikeForNewMatch() {
  likeSentThisMatch = false;
  currentLikeId = null;

  setLikeButtonState(false, "Like");
}

async function sendLike() {
  if (likeSentThisMatch) {
    return;
  }

  const senderId = getChatUserId();
  const receiverId = getChatPartnerId();
  const matchId = getChatMatchId();

  if (!senderId || !receiverId || !matchId) {
    alert("You are not connected to anyone yet.");
    return;
  }

  try {
    setLikeButtonState(true, "Sending...");

    const response = await fetch(
      `${LIKE_API_BASE}/likes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          senderId,
          receiverId,
          matchId
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Unable to send Like."
      );
    }

    likeSentThisMatch = true;
    currentLikeId = data.like?.id || null;

    setLikeButtonState(
      true,
      "Liked"
    );

    showLikeMessage(
      "Like sent. It becomes valid if they stay connected for 10 seconds."
    );

    if (currentLikeId) {
      monitorLikeValidation(currentLikeId);
    }
  } catch (error) {
    console.error(
      "Like error:",
      error
    );

    setLikeButtonState(
      false,
      "Like"
    );

    showLikeMessage(
      error.message || "Unable to send Like."
    );
  }
}

async function monitorLikeValidation(likeId) {
  let attempts = 0;

  const maxAttempts = 30;

  const check = async () => {
    if (!likeId || attempts >= maxAttempts) {
      return;
    }

    attempts += 1;

    try {
      const response = await fetch(
        `${LIKE_API_BASE}/likes/${encodeURIComponent(likeId)}`
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();

      const like = data.like;

      if (!like) {
        return;
      }

      if (like.status === "valid") {
        showLikeMessage(
          "Like is valid. ₹2 has been added to the receiver's earnings."
        );

        return;
      }

      if (like.status === "invalid") {
        showLikeMessage(
          "Like was not valid because the connection did not last 10 seconds."
        );

        return;
      }

      setTimeout(check, 1000);
    } catch (error) {
      console.error(
        "Like validation check error:",
        error
      );
    }
  };

  check();
}

function showLikeMessage(message) {
  let messageElement =
    document.getElementById("likeMessage");

  if (!messageElement) {
    messageElement =
      document.createElement("div");

    messageElement.id =
      "likeMessage";

    messageElement.style.marginTop =
      "10px";

    messageElement.style.textAlign =
      "center";

    const button =
      document.getElementById("likeButton");

    if (button?.parentElement) {
      button.parentElement.appendChild(
        messageElement
      );
    }

    else {
      document.body.appendChild(
        messageElement
      );
    }
  }

  messageElement.textContent = message;
}

function setupLikeButton() {
  const button =
    document.getElementById("likeButton");

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    sendLike
  );
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    setupLikeButton();

    window.VizoLike = {
      sendLike,
      resetLikeForNewMatch,
      getLikeId: () => currentLikeId,
      hasSentLike: () => likeSentThisMatch
    };
  }
);
