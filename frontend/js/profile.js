"use strict";

const PROFILE_API_BASE =
  window.VizoAuth?.VIZOCHAT_API ||
  "http://localhost:5000/api";

async function loadProfile() {
  const message =
    document.getElementById("profileMessage");

  try {
    if (!window.VizoAuth?.isLoggedIn()) {
      window.location.href = "login.html";
      return;
    }

    const response = await fetch(
      `${PROFILE_API_BASE}/profile`,
      {
        method: "GET",
        headers: window.VizoAuth.getAuthHeaders()
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message ||
        "Unable to load profile."
      );
    }

    const profile = data.profile;

    updateProfile(profile);

    if (message) {
      message.textContent = "";
    }
  } catch (error) {
    console.error(
      "Profile loading error:",
      error
    );

    if (message) {
      message.textContent =
        error.message ||
        "Unable to load profile.";
    }
  }
}

function updateProfile(profile) {
  const name =
    document.getElementById("profileName");

  const email =
    document.getElementById("profileEmail");

  const photo =
    document.getElementById("profilePhoto");

  const validLikes =
    document.getElementById("validLikes");

  const totalEarnings =
    document.getElementById("totalEarnings");

  if (name) {
    name.textContent =
      profile.name || "VizoChat User";
  }

  if (email) {
    email.textContent =
      profile.email || "";
  }

  if (photo) {
    if (profile.photo) {
      photo.src = profile.photo;
      photo.style.display = "block";
    } else {
      photo.removeAttribute("src");
      photo.style.display = "none";
    }
  }

  if (validLikes) {
    validLikes.textContent =
      Number(profile.validLikes || 0);
  }

  if (totalEarnings) {
    totalEarnings.textContent =
      `₹${Number(
        profile.totalEarnings || 0
      )}`;
  }
}

function setupLogout() {
  const button =
    document.getElementById("logoutButton");

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    async () => {
      button.disabled = true;
      button.textContent = "Logging out...";

      await window.VizoAuth.logoutUser();
    }
  );
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    setupLogout();
    loadProfile();
  }
);
