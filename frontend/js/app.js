"use strict";

/*
 * VizoChat - Common Frontend App
 * Version: 1.0
 */

const VizoChatApp = {
  /**
   * Initialize common website features.
   */
  init() {
    this.setCurrentYear();
    this.setupMobileNavigation();
    this.setupExternalLinks();
  },

  /**
   * Set current year in elements with id="year".
   */
  setCurrentYear() {
    const yearElements = document.querySelectorAll("#year");

    if (!yearElements.length) {
      return;
    }

    const currentYear = new Date().getFullYear();

    yearElements.forEach((element) => {
      element.textContent = currentYear;
    });
  },

  /**
   * Basic mobile navigation support.
   * Works only when a mobile menu button exists.
   */
  setupMobileNavigation() {
    const menuButton = document.querySelector("[data-menu-button]");
    const navigation = document.querySelector("[data-navigation]");

    if (!menuButton || !navigation) {
      return;
    }

    menuButton.addEventListener("click", () => {
      const isOpen =
        navigation.getAttribute("data-open") === "true";

      navigation.setAttribute(
        "data-open",
        String(!isOpen)
      );

      menuButton.setAttribute(
        "aria-expanded",
        String(!isOpen)
      );
    });
  },

  /**
   * Open external links safely in a new tab.
   */
  setupExternalLinks() {
    const externalLinks =
      document.querySelectorAll(
        'a[data-external="true"]'
      );

    externalLinks.forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }
};


/*
 * Small helper functions
 */

function getStoredValue(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);

    return value !== null ? value : fallback;
  } catch (error) {
    console.warn(
      "VizoChat: Unable to read localStorage.",
      error
    );

    return fallback;
  }
}


function setStoredValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch (error) {
    console.warn(
      "VizoChat: Unable to write localStorage.",
      error
    );

    return false;
  }
}


function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(
      "VizoChat: Unable to remove localStorage value.",
      error
    );

    return false;
  }
}


/*
 * Start the common app.
 */
document.addEventListener("DOMContentLoaded", () => {
  VizoChatApp.init();
});
