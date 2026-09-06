"use strict";

/*
 * VizoChat Authentication
 * Version: 1.0
 *
 * NOTE:
 * Real Google authentication backend se connect hone ke baad
 * add ki jayegi. Abhi ye frontend authentication state
 * manage karne ka base hai.
 */

const VizoChatAuth = {

  STORAGE_KEY: "vizochat_auth",
  GUEST_MATCH_KEY: "vizochat_guest_matches",
  MAX_GUEST_MATCHES: 10,

  /**
   * Get current authentication state.
   */
  getAuth() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);

      if (!data) {
        return {
          loggedIn: false,
          user: null
        };
      }

      const parsed = JSON.parse(data);

      return {
        loggedIn: parsed.loggedIn === true,
        user: parsed.user || null
      };

    } catch (error) {
      console.error(
        "VizoChat Auth: Unable to read authentication state.",
        error
      );

      return {
        loggedIn: false,
        user: null
      };
    }
  },


  /**
   * Check whether user is logged in.
   */
  isLoggedIn() {
    return this.getAuth().loggedIn;
  },


  /**
   * Get logged-in user.
   */
  getUser() {
    return this.getAuth().user;
  },


  /**
   * Save user authentication state.
   *
   * This is only a frontend placeholder.
   * Real authentication will be verified by backend.
   */
  setUser(user) {

    if (!user || typeof user !== "object") {
      return false;
    }

    const authData = {
      loggedIn: true,
      user: {
        id: user.id || null,
        name: user.name || "VizoChat User",
        email: user.email || "",
        photo: user.photo || ""
      }
    };

    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(authData)
      );

      return true;

    } catch (error) {
      console.error(
        "VizoChat Auth: Unable to save user.",
        error
      );

      return false;
    }
  },


  /**
   * Logout current user.
   */
  logout() {

    try {
      localStorage.removeItem(this.STORAGE_KEY);

      return true;

    } catch (error) {
      console.error(
        "VizoChat Auth: Logout failed.",
        error
      );

      return false;
    }
  },


  /**
   * Get number of guest matches.
   */
  getGuestMatches() {

    try {
      const value =
        localStorage.getItem(this.GUEST_MATCH_KEY);

      const matches = Number(value);

      if (!Number.isFinite(matches) || matches < 0) {
        return 0;
      }

      return Math.min(
        Math.floor(matches),
        this.MAX_GUEST_MATCHES
      );

    } catch (error) {
      console.error(
        "VizoChat Auth: Unable to read guest matches.",
        error
      );

      return 0;
    }
  },


  /**
   * Increase guest match count.
   */
  addGuestMatch() {

    if (this.isLoggedIn()) {
      return this.getGuestMatches();
    }

    const current = this.getGuestMatches();

    if (current >= this.MAX_GUEST_MATCHES) {
      return this.MAX_GUEST_MATCHES;
    }

    const next = current + 1;

    try {
      localStorage.setItem(
        this.GUEST_MATCH_KEY,
        String(next)
      );
    } catch (error) {
      console.error(
        "VizoChat Auth: Unable to save guest match count.",
        error
      );
    }

    return next;
  },


  /**
   * Check whether guest can start another match.
   */
  canStartGuestMatch() {

    if (this.isLoggedIn()) {
      return true;
    }

    return this.getGuestMatches() <
      this.MAX_GUEST_MATCHES;
  },


  /**
   * Reset guest matches.
   *
   * This is mainly useful for development/testing.
   */
  resetGuestMatches() {

    try {
      localStorage.removeItem(
        this.GUEST_MATCH_KEY
      );

      return true;

    } catch (error) {
      console.error(
        "VizoChat Auth: Unable to reset guest matches.",
        error
      );

      return false;
    }
  },


  /**
   * Require login.
   *
   * Returns true if user can continue.
   * Otherwise redirects to login page.
   */
  requireLogin() {

    if (this.isLoggedIn()) {
      return true;
    }

    window.location.href = "login.html";

    return false;
  },


  /**
   * Handle starting a random chat.
   *
   * Logged-in users can continue.
   * Guests can use up to 10 matches.
   */
  startRandomChat() {

    if (this.isLoggedIn()) {
      window.location.href = "chat.html";
      return true;
    }

    if (this.canStartGuestMatch()) {
      window.location.href = "chat.html";
      return true;
    }

    window.location.href = "login.html";

    return false;
  }
};


/*
 * Make authentication object available globally.
 */
window.VizoChatAuth = VizoChatAuth;
