"use strict";

/* ================================
   VizoChat Production API
================================ */
const VIZOCHAT_API =
  window.VIZOCHAT_API || "https://website-r746.onrender.com/api";

const GUEST_MATCH_LIMIT = 10;


/* ================================
   AUTH TOKEN
================================ */
function getAuthToken() {
  return localStorage.getItem("vizochat_auth_token") || null;
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem("vizochat_auth_token", token);
  }
}

function removeAuthToken() {
  localStorage.removeItem("vizochat_auth_token");
}


/* ================================
   CURRENT USER
================================ */
function getCurrentUser() {
  try {
    const user = localStorage.getItem("vizochat_user");
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error("Unable to read user:", error);
    return null;
  }
}

function setCurrentUser(user) {
  if (user) {
    localStorage.setItem("vizochat_user", JSON.stringify(user));
  }
}

function removeCurrentUser() {
  localStorage.removeItem("vizochat_user");
}


/* ================================
   LOGIN STATUS
================================ */
function isLoggedIn() {
  return Boolean(getAuthToken() && getCurrentUser());
}

function isGuest() {
  return !isLoggedIn();
}


/* ================================
   GUEST MATCH SYSTEM
================================ */
function getGuestMatchCount() {
  const count = Number(
    localStorage.getItem("vizochat_guest_matches") || 0
  );

  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function setGuestMatchCount(count) {
  const safeCount = Math.max(0, Number(count) || 0);

  localStorage.setItem(
    "vizochat_guest_matches",
    String(safeCount)
  );

  return safeCount;
}

function incrementGuestMatchCount() {
  const currentCount = getGuestMatchCount();

  if (currentCount >= GUEST_MATCH_LIMIT) {
    return currentCount;
  }

  return setGuestMatchCount(currentCount + 1);
}

function canGuestStartMatch() {
  return getGuestMatchCount() < GUEST_MATCH_LIMIT;
}

function getGuestMatchesRemaining() {
  return Math.max(
    0,
    GUEST_MATCH_LIMIT - getGuestMatchCount()
  );
}


/* ================================
   USER ID
================================ */
function getGuestUserId() {
  let guestId = localStorage.getItem("vizochat_guest_id");

  if (!guestId) {
    guestId =
      "guest-" +
      Date.now() +
      "-" +
      Math.random().toString(36).substring(2, 10);

    localStorage.setItem(
      "vizochat_guest_id",
      guestId
    );
  }

  return guestId;
}

function getUserId() {
  const user = getCurrentUser();

  if (user && user.id) {
    return user.id;
  }

  return getGuestUserId();
}

function getUserType() {
  return isLoggedIn() ? "user" : "guest";
}


/* ================================
   API HEADERS
================================ */
function getAuthHeaders() {
  const token = getAuthToken();

  if (!token) {
    return {
      "Content-Type": "application/json"
    };
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}


/* ================================
   USER ACCESS CHECK
================================ */
async function checkUserAccess() {
  if (isGuest()) {
    return {
      allowed: canGuestStartMatch(),
      guest: true,
      matchesRemaining: getGuestMatchesRemaining()
    };
  }

  const userId = getUserId();

  try {
    const response = await fetch(
      `${VIZOCHAT_API}/users/${encodeURIComponent(userId)}/access`,
      {
        method: "GET",
        headers: getAuthHeaders()
      }
    );

    const data = await response.json();

    return {
      ...data,
      guest: false
    };
  } catch (error) {
    console.error("Access check failed:", error);

    return {
      success: false,
      allowed: false,
      guest: false,
      reason: "Unable to connect to VizoChat server."
    };
  }
}


/* ================================
   GOOGLE LOGIN
================================ */
function startGoogleLogin() {
  window.location.href =
    `${VIZOCHAT_API}/auth/google`;
}


/* ================================
   GOOGLE LOGIN CALLBACK
================================ */
function handleLoginCallback() {
  const params = new URLSearchParams(
    window.location.search
  );

  const token = params.get("token");
  const userData = params.get("user");

  if (!token) {
    return false;
  }

  setAuthToken(token);

  if (userData) {
    try {
      const user = JSON.parse(
        decodeURIComponent(userData)
      );

      setCurrentUser(user);
    } catch (error) {
      console.error(
        "Unable to read login user data:",
        error
      );
    }
  }

  /* Remove token/user from browser URL */
  const cleanUrl =
    window.location.origin +
    window.location.pathname;

  window.history.replaceState(
    {},
    document.title,
    cleanUrl
  );

  return true;
}


/* ================================
   LOGOUT
================================ */
async function logoutUser() {
  const token = getAuthToken();

  try {
    if (token) {
      await fetch(
        `${VIZOCHAT_API}/auth/logout`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
    }
  } catch (error) {
    console.error(
      "Logout request failed:",
      error
    );
  }

  removeAuthToken();
  removeCurrentUser();

  window.location.href = "index.html";
}


/* ================================
   LOGIN REQUIRED
================================ */
function requireLogin() {
  if (!isLoggedIn()) {
    window.location.href = "login.html";
    return false;
  }

  return true;
}


/* ================================
   LOGIN STATUS
================================ */
function getLoginStatus() {
  return {
    loggedIn: isLoggedIn(),
    guest: isGuest(),
    user: getCurrentUser(),
    userId: getUserId(),
    guestMatches: getGuestMatchCount(),
    guestMatchesRemaining:
      getGuestMatchesRemaining()
  };
}


/* ================================
   AUTO PROCESS GOOGLE CALLBACK
================================ */
document.addEventListener(
  "DOMContentLoaded",
  () => {
    handleLoginCallback();
  }
);


/* ================================
   GLOBAL VIZO AUTH
================================ */
window.VizoAuth = {
  VIZOCHAT_API,

  GUEST_MATCH_LIMIT,

  getAuthToken,
  setAuthToken,
  removeAuthToken,

  getCurrentUser,
  setCurrentUser,
  removeCurrentUser,

  isLoggedIn,
  isGuest,

  getGuestMatchCount,
  setGuestMatchCount,
  incrementGuestMatchCount,
  canGuestStartMatch,
  getGuestMatchesRemaining,

  getGuestUserId,
  getUserId,
  getUserType,

  getAuthHeaders,
  checkUserAccess,

  startGoogleLogin,
  handleLoginCallback,

  logoutUser,
  requireLogin,

  getLoginStatus
};
