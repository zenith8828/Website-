"use strict";

/*
 * VizoChat Chat Controller
 * Version: 1.0
 *
 * This file prepares the frontend for:
 * - Camera / microphone
 * - Random matching
 * - Next user
 * - Match timer
 * - Guest match limit
 *
 * Real P2P WebRTC signaling and server matching
 * will be connected from the backend later.
 */

const VizoChatChat = {

  localStream: null,
  matchTimer: null,
  matchSeconds: 0,
  isMatched: false,
  isSearching: false,

  elements: {},


  init() {

    this.cacheElements();
    this.bindEvents();
    this.updateGuestCounter();
    this.updateStatus("Ready to start");

  },


  cacheElements() {

    this.elements.localVideo =
      document.getElementById("localVideo");

    this.elements.remoteVideo =
      document.getElementById("remoteVideo");

    this.elements.status =
      document.getElementById("chatStatus");

    this.elements.startButton =
      document.getElementById("startChat");

    this.elements.nextButton =
      document.getElementById("nextButton");

    this.elements.cameraButton =
      document.getElementById("cameraButton");

    this.elements.micButton =
      document.getElementById("micButton");

    this.elements.likeButton =
      document.getElementById("likeButton");

    this.elements.reportButton =
      document.getElementById("reportButton");

    this.elements.matchCounter =
      document.getElementById("guestMatchCounter");

    this.elements.timer =
      document.getElementById("matchTimer");

  },


  bindEvents() {

    if (this.elements.startButton) {
      this.elements.startButton.addEventListener(
        "click",
        () => this.startChat()
      );
    }


    if (this.elements.nextButton) {
      this.elements.nextButton.addEventListener(
        "click",
        () => this.nextUser()
      );
    }


    if (this.elements.cameraButton) {
      this.elements.cameraButton.addEventListener(
        "click",
        () => this.toggleCamera()
      );
    }


    if (this.elements.micButton) {
      this.elements.micButton.addEventListener(
        "click",
        () => this.toggleMicrophone()
      );
    }


    if (this.elements.likeButton) {
      this.elements.likeButton.addEventListener(
        "click",
        () => this.likeUser()
      );
    }


    if (this.elements.reportButton) {
      this.elements.reportButton.addEventListener(
        "click",
        () => this.reportUser()
      );
    }

  },


  async startChat() {

    if (this.isSearching || this.isMatched) {
      return;
    }


    if (
      window.VizoChatAuth &&
      !window.VizoChatAuth.canStartGuestMatch()
    ) {
      window.location.href = "login.html";
      return;
    }


    this.isSearching = true;

    this.updateStatus("Starting camera...");


    const cameraStarted =
      await this.startCamera();


    if (!cameraStarted) {

      this.isSearching = false;

      this.updateStatus(
        "Camera/microphone permission is required."
      );

      return;
    }


    this.updateStatus("Finding someone...");


    /*
     * Backend matching will be connected here.
     *
     * For now this only displays the searching state.
     */
    setTimeout(() => {

      if (!this.isSearching) {
        return;
      }

      this.isSearching = false;

      this.updateStatus(
        "Waiting for another user..."
      );

    }, 1000);

  },


  async startCamera() {

    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {

      console.error(
        "VizoChat: getUserMedia is not supported."
      );

      return false;
    }


    try {

      this.localStream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });


      if (this.elements.localVideo) {

        this.elements.localVideo.srcObject =
          this.localStream;

        this.elements.localVideo.muted = true;

        this.elements.localVideo.playsInline = true;

        try {
          await this.elements.localVideo.play();
        } catch (error) {
          console.warn(
            "VizoChat: Local video autoplay failed.",
            error
          );
        }

      }


      return true;

    } catch (error) {

      console.error(
        "VizoChat: Camera/microphone error.",
        error
      );

      return false;
    }

  },


  stopCamera() {

    if (!this.localStream) {
      return;
    }


    this.localStream
      .getTracks()
      .forEach((track) => {
        track.stop();
      });


    this.localStream = null;


    if (this.elements.localVideo) {
      this.elements.localVideo.srcObject = null;
    }

  },


  toggleCamera() {

    if (!this.localStream) {
      return;
    }


    const videoTracks =
      this.localStream.getVideoTracks();


    if (!videoTracks.length) {
      return;
    }


    const track = videoTracks[0];

    track.enabled = !track.enabled;


    if (this.elements.cameraButton) {

      this.elements.cameraButton.textContent =
        track.enabled
          ? "Camera"
          : "Camera Off";

    }

  },


  toggleMicrophone() {

    if (!this.localStream) {
      return;
    }


    const audioTracks =
      this.localStream.getAudioTracks();


    if (!audioTracks.length) {
      return;
    }


    const track = audioTracks[0];

    track.enabled = !track.enabled;


    if (this.elements.micButton) {

      this.elements.micButton.textContent =
        track.enabled
          ? "Mic"
          : "Mic Off";

    }

  },


  nextUser() {

    this.stopMatchTimer();

    this.isMatched = false;

    this.isSearching = false;


    if (this.elements.remoteVideo) {
      this.elements.remoteVideo.srcObject = null;
    }


    if (
      window.VizoChatAuth &&
      !window.VizoChatAuth.isLoggedIn()
    ) {

      const matches =
        window.VizoChatAuth.addGuestMatch();

      this.updateGuestCounter(matches);


      if (
        matches >=
        window.VizoChatAuth.MAX_GUEST_MATCHES
      ) {

        this.updateStatus(
          "10 guest matches completed. Login required."
        );

        setTimeout(() => {
          window.location.href = "login.html";
        }, 800);

        return;
      }

    }


    this.startChat();

  },


  setMatched() {

    this.isSearching = false;

    this.isMatched = true;

    this.matchSeconds = 0;

    this.startMatchTimer();

    this.updateStatus("Connected");

  },


  startMatchTimer() {

    this.stopMatchTimer();


    this.updateTimer();


    this.matchTimer =
      setInterval(() => {

        this.matchSeconds++;

        this.updateTimer();

      }, 1000);

  },


  stopMatchTimer() {

    if (this.matchTimer) {

      clearInterval(this.matchTimer);

      this.matchTimer = null;

    }

  },


  updateTimer() {

    if (!this.elements.timer) {
      return;
    }


    const minutes =
      Math.floor(this.matchSeconds / 60)
        .toString()
        .padStart(2, "0");


    const seconds =
      (this.matchSeconds % 60)
        .toString()
        .padStart(2, "0");


    this.elements.timer.textContent =
      `${minutes}:${seconds}`;

  },


  updateStatus(message) {

    if (this.elements.status) {
      this.elements.status.textContent = message;
    }

  },


  updateGuestCounter(value = null) {

    if (!this.elements.matchCounter) {
      return;
    }


    let matches = value;


    if (
      matches === null &&
      window.VizoChatAuth
    ) {
      matches =
        window.VizoChatAuth.getGuestMatches();
    }


    if (matches === null) {
      matches = 0;
    }


    this.elements.matchCounter.textContent =
      `${matches}/10`;

  },


  likeUser() {

    if (!this.isMatched) {

      this.updateStatus(
        "You are not connected to a user."
      );

      return;
    }


    /*
     * Real Like validation will happen on the server.
     * The server will enforce:
     * - One Like per session
     * - Receiver stays connected for 10 seconds
     * - Valid Like = ₹2
     */

    this.updateStatus(
      "Like request sent."
    );

  },


  reportUser() {

    if (!this.isMatched) {

      this.updateStatus(
        "You are not connected to a user."
      );

      return;
    }


    const confirmed =
      window.confirm(
        "Are you sure you want to report this user?"
      );


    if (!confirmed) {
      return;
    }


    /*
     * Real report submission will be handled
     * securely by the backend.
     */

    this.updateStatus(
      "Report submitted."
    );

  }

};


document.addEventListener(
  "DOMContentLoaded",
  () => {

    VizoChatChat.init();

  }
);


window.VizoChatChat = VizoChatChat;
