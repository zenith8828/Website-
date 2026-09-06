"use strict";

/*
 * VizoChat Profile
 * Version: 1.0
 *
 * Profile data will eventually come from the backend.
 * Do not trust frontend values for Likes or Earnings.
 */

const VizoChatProfile = {

  elements: {},

  init() {
    this.cacheElements();
    this.loadProfile();
  },


  cacheElements() {

    this.elements.name =
      document.getElementById("profileName");

    this.elements.email =
      document.getElementById("profileEmail");

    this.elements.photo =
      document.getElementById("profilePhoto");

    this.elements.likes =
      document.getElementById("validLikes");

    this.elements.earnings =
      document.getElementById("totalEarnings");

  },


  loadProfile() {

    /*
     * If authentication system is available,
     * use the logged-in user's basic information.
     */

    if (
      window.VizoChatAuth &&
      window.VizoChatAuth.isLoggedIn()
    ) {

      const user =
        window.VizoChatAuth.getUser();

      if (user) {

        this.setText(
          this.elements.name,
          user.name || "VizoChat User"
        );

        this.setText(
          this.elements.email,
          user.email || ""
        );


        if (
          this.elements.photo &&
          user.photo
        ) {

          this.elements.photo.src =
            user.photo;

          this.elements.photo.alt =
            user.name || "Profile photo";

        }

      }

    }


    /*
     * Temporary display values.
     *
     * Real Likes and Earnings will come
     * securely from the backend.
     */

    this.setText(
      this.elements.likes,
      "0"
    );

    this.setText(
      this.elements.earnings,
      "₹0"
    );

  },


  setText(element, value) {

    if (!element) {
      return;
    }

    element.textContent = String(value);

  }

};


document.addEventListener(
  "DOMContentLoaded",
  () => {
    VizoChatProfile.init();
  }
);


window.VizoChatProfile =
  VizoChatProfile;
