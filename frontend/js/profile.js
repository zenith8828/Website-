"use strict";

/* =========================================
   VizoChat Profile
========================================= */

const PROFILE_API_BASE =
  window.VizoAuth?.VIZOCHAT_API ||
  "https://website-r746.onrender.com/api";


/* =========================================
   LOAD PROFILE
========================================= */

async function loadProfile() {
  const message =
    document.getElementById("profileMessage");

  try {
    /* Login required */
    if (!window.VizoAuth?.isLoggedIn()) {
      window.location.href = "login.html";
      return;
    }

    if (message) {
      message.textContent =
        "Loading profile...";
    }

    const response =
      await fetch(
        `${PROFILE_API_BASE}/profile`,
        {
          method: "GET",
          headers:
            window.VizoAuth.getAuthHeaders()
        }
      );

    const data =
      await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message ||
        "Unable to load profile."
      );
    }

    updateProfile(data.profile);

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


/* =========================================
   UPDATE PROFILE UI
========================================= */

function updateProfile(profile) {
  if (!profile) return;

  const name =
    document.getElementById(
      "profileName"
    );

  const email =
    document.getElementById(
      "profileEmail"
    );

  const photo =
    document.getElementById(
      "profilePhoto"
    );

  const validLikes =
    document.getElementById(
      "validLikes"
    );

  const totalEarnings =
    document.getElementById(
      "totalEarnings"
    );


  /* Name */
  if (name) {
    name.textContent =
      profile.name ||
      "VizoChat User";
  }


  /* Email */
  if (email) {
    email.textContent =
      profile.email || "";
  }


  /* Profile photo */
  if (photo) {
    if (profile.photo) {
      photo.src = profile.photo;
      photo.style.display = "block";
    } else {
      photo.removeAttribute("src");
      photo.style.display = "none";
    }
  }


  /* Valid Likes */
  if (validLikes) {
    validLikes.textContent =
      Number(profile.validLikes || 0);
  }


  /* Earnings */
  if (totalEarnings) {
    totalEarnings.textContent =
      `₹${Number(
        profile.totalEarnings || 0
      )}`;
  }
}


/* =========================================
   LOGOUT
========================================= */

function setupLogout() {
  const button =
    document.getElementById(
      "logoutButton"
    );

  if (!button) return;

  button.addEventListener(
    "click",
    async () => {
      button.disabled = true;
      button.textContent =
        "Logging out...";

      try {
        await window.VizoAuth.logoutUser();
      } catch (error) {
        console.error(
          "Logout error:",
          error
        );

        button.disabled = false;
        button.textContent =
          "Logout";
      }
    }
  );
}


/* =========================================
   PAGE START
========================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    setupLogout();
    loadProfile();
  }
);


/* =========================================
   GLOBAL PROFILE
========================================= */

window.VizoProfile = {
  loadProfile,
  updateProfile
};
