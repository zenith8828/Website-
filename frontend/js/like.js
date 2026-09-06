"use strict";

/*
 * VizoChat Like System
 * Version: 1.0
 *
 * Rules:
 * - Only one Like per chat session.
 * - Like is NOT immediately valid.
 * - Receiver must remain connected for 10 seconds.
 * - Valid Like = ₹2 for receiver.
 *
 * Final validation will be done by the backend.
 */

const VizoChatLike = {

  LIKE_USED_KEY: "vizochat_like_used",

  likeUsed: false,
  likeSentAt: null,
  receiverConnectedAt: null,


  init() {

    this.loadState();
    this.bindButton();

  },


  bindButton() {

    const button =
      document.getElementById("likeButton");

    if (!button) {
      return;
    }


    button.addEventListener(
      "click",
      () => this.sendLike()
    );

    this.updateButton();

  },


  loadState() {

    try {

      const value =
        sessionStorage.getItem(
          this.LIKE_USED_KEY
        );

      this.likeUsed = value === "true";

    } catch (error) {

      console.warn(
        "VizoChat Like: Unable to read session state.",
        error
      );

      this.likeUsed = false;
    }

  },


  saveState() {

    try {

      sessionStorage.setItem(
        this.LIKE_USED_KEY,
        String(this.likeUsed)
      );

    } catch (error) {

      console.warn(
        "VizoChat Like: Unable to save session state.",
        error
      );

    }

  },


  setReceiverConnected() {

    this.receiverConnectedAt =
      Date.now();

  },


  clearSession() {

    this.likeUsed = false;
    this.likeSentAt = null;
    this.receiverConnectedAt = null;

    try {

      sessionStorage.removeItem(
        this.LIKE_USED_KEY
      );

    } catch (error) {

      console.warn(
        "VizoChat Like: Unable to clear session.",
        error
      );

    }

    this.updateButton();

  },


  canLike() {

    return !this.likeUsed;

  },


  sendLike() {

    if (this.likeUsed) {

      this.showMessage(
        "You already used your Like for this chat."
      );

      return false;
    }


    this.likeUsed = true;

    this.likeSentAt = Date.now();

    this.saveState();

    this.updateButton();


    /*
     * IMPORTANT:
     * The frontend does NOT decide whether a Like
     * is valid or whether ₹2 should be added.
     *
     * Backend will verify:
     * 1. Correct chat session
     * 2. Only one Like
     * 3. Receiver connection
     * 4. 10-second requirement
     * 5. Valid Like
     * 6. ₹2 earnings
     */


    this.showMessage(
      "Like sent. It will become valid if the receiver stays connected for 10 seconds."
    );


    return true;

  },


  updateButton() {

    const button =
      document.getElementById("likeButton");

    if (!button) {
      return;
    }


    if (this.likeUsed) {

      button.disabled = true;

      button.textContent =
        "Like Sent";

    } else {

      button.disabled = false;

      button.textContent =
        "Like";

    }

  },


  showMessage(message) {

    const status =
      document.getElementById("chatStatus");

    if (status) {
      status.textContent = message;
    }

  }

};


document.addEventListener(
  "DOMContentLoaded",
  () => {

    VizoChatLike.init();

  }
);


window.VizoChatLike = VizoChatLike;
