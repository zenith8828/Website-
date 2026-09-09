"use strict";

/*
 * VizoChat Random Video Chat
 * Version 12
 */

const VIZO_API = "https://website-r746.onrender.com/api";
const VIZO_SOCKET = "https://website-r746.onrender.com";

let socket = null;

let localStream = null;
let peerConnection = null;

let currentMatchId = null;
let currentPartnerId = null;

let isSearching = false;
let isMatched = false;
let isConnected = false;
let isInitiator = false;

let searchTimer = null;
let callTimer = null;
let callSeconds = 0;

let iceCandidateQueue = [];
let pendingOffer = null;

let cameraEnabled = false;
let microphoneEnabled = false;

let reportSubmitted = false;

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

let initialized = false;

/* -----------------------------------------
   DOM
----------------------------------------- */

const remoteVideo = document.getElementById("remoteVideo");
const localVideo = document.getElementById("localVideo");

const remotePlaceholder =
  document.getElementById("remotePlaceholder");

const localPlaceholder =
  document.getElementById("localPlaceholder");

const statusElement =
  document.getElementById("status");

const timerElement =
  document.getElementById("timer");

const reportButton =
  document.getElementById("reportBtn");

const likeButton =
  document.getElementById("likeBtn");

const chatButton =
  document.getElementById("chatBtn");

const cameraButton =
  document.getElementById("cameraBtn");

const micButton =
  document.getElementById("micBtn");

const coinButton =
  document.getElementById("coinBtn");

const chatPanel =
  document.getElementById("chatPanel");

const chatCloseButton =
  document.getElementById("chatCloseBtn");

const chatMessages =
  document.getElementById("chatMessages");

const chatForm =
  document.getElementById("chatForm");

const chatInput =
  document.getElementById("chatInput");

const chatSendButton =
  document.getElementById("chatSendBtn");

const chatEmpty =
  document.getElementById("chatEmpty");

const videoArea =
  document.getElementById("videoArea");

/* -----------------------------------------
   AUTH
----------------------------------------- */

function getAuthData() {
  let userId = null;
  let isGuest = true;
  let token = null;

  try {
    if (
      window.VizoAuth &&
      typeof window.VizoAuth.getUserId === "function"
    ) {
      userId = window.VizoAuth.getUserId();
    }

    if (
      window.VizoAuth &&
      typeof window.VizoAuth.getUserType === "function"
    ) {
      isGuest =
        window.VizoAuth.getUserType() !== "user";
    }
  } catch (error) {
    console.warn("VizoAuth read error:", error);
  }

  try {
    token =
      localStorage.getItem("vizochat_auth_token") ||
      localStorage.getItem("vizoAuthToken") ||
      null;
  } catch (error) {
    console.warn("Token storage error:", error);
  }

  if (!userId) {
    try {
      const savedUser =
        localStorage.getItem("vizochat_user");

      if (savedUser) {
        const parsed = JSON.parse(savedUser);

        if (parsed && parsed.id) {
          userId = parsed.id;
          isGuest = false;
        }
      }
    } catch (error) {
      console.warn("Saved user read error:", error);
    }
  }

  if (!userId) {
    try {
      let guestId =
        localStorage.getItem("vizoGuestId");

      if (!guestId) {
        guestId =
          "guest_" +
          Date.now() +
          "_" +
          Math.random()
            .toString(36)
            .slice(2, 10);

        localStorage.setItem(
          "vizoGuestId",
          guestId
        );
      }

      userId = guestId;
      isGuest = true;
    } catch (error) {
      userId =
        "guest_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 10);

      isGuest = true;
    }
  }

  return {
    userId,
    isGuest,
    token
  };
}

/* -----------------------------------------
   UI
----------------------------------------- */

function setStatus(message) {
  if (!statusElement) return;

  statusElement.textContent =
    message || "";
}

function setConnectedUI() {
  setStatus("Connected");

  if (remotePlaceholder) {
    remotePlaceholder.classList.add("hidden");
  }

  if (localPlaceholder && localStream) {
    localPlaceholder.classList.add("hidden");
  }

  if (likeButton) {
    likeButton.disabled = false;
  }

  if (reportButton) {
    reportButton.disabled =
      !currentPartnerId;
  }

  enableChat();

  startCallTimer();
}

function setSearchingUI() {
  setStatus("Looking for someone...");

  if (remotePlaceholder) {
    remotePlaceholder.classList.remove("hidden");
  }

  if (remotePlaceholder) {
    const title =
      remotePlaceholder.querySelector(
        ".placeholder-title"
      );

    if (title) {
      title.textContent =
        "Looking for someone...";
    }
  }

  if (likeButton) {
    likeButton.disabled = true;
  }

  if (reportButton) {
    reportButton.disabled = true;
  }

  disableChat();
}

function setCameraStartingUI() {
  setStatus("Starting camera...");

  if (localPlaceholder) {
    localPlaceholder.classList.remove("hidden");
  }
}

/* -----------------------------------------
   MEDIA
----------------------------------------- */

async function requestMedia() {
  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    throw new Error(
      "Camera is not available. Use HTTPS and allow camera access."
    );
  }

  setCameraStartingUI();

  let videoStream = null;

  try {
    /*
     * CAMERA FIRST.
     * Camera is requested separately so microphone permission
     * cannot prevent the camera from starting.
     */
    videoStream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user"
        }
      });
  } catch (error) {
    console.error(
      "VizoChat camera error:",
      error
    );

    let message =
      "Allow camera permission, then try again.";

    if (
      error &&
      error.name === "NotAllowedError"
    ) {
      message =
        "Camera permission is blocked. Allow camera access for this site, then try again.";
    } else if (
      error &&
      error.name === "NotFoundError"
    ) {
      message =
        "No camera was found on this device.";
    } else if (
      error &&
      error.name === "NotReadableError"
    ) {
      message =
        "Camera is being used by another app. Close it and try again.";
    } else if (
      error &&
      error.name === "SecurityError"
    ) {
      message =
        "Camera requires HTTPS and browser permission.";
    } else if (
      error &&
      error.name === "OverconstrainedError"
    ) {
      message =
        "The requested camera is unavailable. Try again.";
    }

    setStatus(message);

    if (localPlaceholder) {
      localPlaceholder.classList.remove(
        "hidden"
      );

      const title =
        localPlaceholder.querySelector(
          ".placeholder-title"
        );

      const text =
        localPlaceholder.querySelector(
          ".placeholder-text"
        );

      if (title) {
        title.textContent =
          "Camera access needed";
      }

      if (text) {
        text.textContent =
          message;
      }

      let retryButton =
        localPlaceholder.querySelector(
          "#retryCameraBtn"
        );

      if (!retryButton) {
        retryButton =
          document.createElement(
            "button"
          );

        retryButton.type =
          "button";

        retryButton.id =
          "retryCameraBtn";

        retryButton.textContent =
          "📷 Start Camera";

        retryButton.style.cssText =
          "margin-top:12px;padding:10px 16px;border:0;border-radius:10px;cursor:pointer;font-weight:700;";

        retryButton.addEventListener(
          "click",
          async () => {
            retryButton.disabled =
              true;

            retryButton.textContent =
              "Starting...";

            try {
              await requestMedia();

              await connectSocket();

              startSearching();
            } catch (
              retryError
            ) {
              console.error(
                "Camera retry error:",
                retryError
              );

              retryButton.disabled =
                false;

              retryButton.textContent =
                "📷 Start Camera";
            }
          }
        );

        localPlaceholder.appendChild(
          retryButton
        );
      }
    }

    throw error;
  }

  /*
   * Camera stream is attached immediately.
   */
  localStream =
    videoStream;

  cameraEnabled =
    true;

  if (localVideo) {
    localVideo.autoplay =
      true;

    localVideo.playsInline =
      true;

    localVideo.muted =
      true;

    localVideo.srcObject =
      localStream;

    try {
      await localVideo.play();
    } catch (error) {
      console.warn(
        "Local video play:",
        error
      );

      await new Promise(
        (resolve) => {
          const playWhenReady =
            () => {
              localVideo
                .play()
                .catch(
                  () => {}
                );

              resolve();
            };

          if (
            localVideo.readyState >=
            2
          ) {
            playWhenReady();
          } else {
            localVideo.addEventListener(
              "loadedmetadata",
              playWhenReady,
              {
                once: true
              }
            );
          }
        }
      );
    }
  }

  if (cameraButton) {
    cameraButton.classList.add(
      "active"
    );

    cameraButton.classList.remove(
      "camera-off"
    );

    cameraButton.textContent =
      "📷";
  }

  if (localPlaceholder) {
    localPlaceholder.classList.add(
      "hidden"
    );
  }

  const retryButton =
    document.getElementById(
      "retryCameraBtn"
    );

  if (retryButton) {
    retryButton.remove();
  }

  /*
   * MICROPHONE SECOND.
   * Camera remains active even if microphone permission fails.
   */
  try {
    const audioStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    audioStream
      .getAudioTracks()
      .forEach(
        (track) => {
          localStream.addTrack(
            track
          );
        }
      );

    microphoneEnabled =
      true;

    if (micButton) {
      micButton.textContent =
        "🎤";
    }
  } catch (error) {
    console.warn(
      "VizoChat microphone error:",
      error
    );

    microphoneEnabled =
      false;

    if (micButton) {
      micButton.textContent =
        "🔇";
    }

    setStatus(
      "Camera started. Microphone permission is needed for audio."
    );
  }

  return localStream;
}

/* -----------------------------------------
   SOCKET
----------------------------------------- */

function connectSocket() {
  return new Promise(
    (resolve, reject) => {

      if (
        socket &&
        socket.connected
      ) {
        resolve(socket);
        return;
      }

      socket =
        io(
          VIZO_SOCKET,
          {
            transports: [
              "websocket",
              "polling"
            ],
            reconnection: true,
            reconnectionAttempts: 10
          }
        );

      let resolved =
        false;

      socket.on(
        "connect",
        () => {
          console.log(
            "Socket connected:",
            socket.id
          );

          registerUser();

          if (!resolved) {
            resolved =
              true;

            resolve(
              socket
            );
          }
        }
      );

      socket.on(
        "connect_error",
        (error) => {
          console.error(
            "Socket connection error:",
            error
          );

          if (!resolved) {
            resolved =
              true;

            reject(
              error
            );
          }
        }
      );

      setupSocketEvents();
    }
  );
}
/* -----------------------------------------
   SOCKET EVENTS
----------------------------------------- */

function setupSocketEvents() {
  if (!socket) return;

  socket.on("registered", (data) => {
    console.log("User registered:", data);
  });

  socket.on("register-success", (data) => {
    console.log("Register success:", data);
  });

  socket.on("match-found", async (data) => {
    console.log("Match found:", data);

    isSearching = false;
    isMatched = true;
    isConnected = false;

    currentMatchId =
      data.matchId ||
      data.match_id ||
      null;

    currentPartnerId =
      data.partnerId ||
      data.partner_id ||
      data.userId ||
      data.partner ||
      null;

    isInitiator =
      Boolean(
        data.isInitiator ||
        data.initiator
      );

    reportSubmitted = false;

    clearSearchTimer();

    setStatus(
      "Matched. Connecting..."
    );

    if (remotePlaceholder) {
      remotePlaceholder.classList.remove(
        "hidden"
      );

      const title =
        remotePlaceholder.querySelector(
          ".placeholder-title"
        );

      if (title) {
        title.textContent =
          "Connecting...";
      }
    }

    resetCallTimer();

    if (!peerConnection) {
      createPeerConnection();
    }

    if (isInitiator) {
      try {
        await createOffer();
      } catch (error) {
        console.error(
          "Create offer error:",
          error
        );

        setStatus(
          "Connection failed. Try Next."
        );
      }
    }
  });

  socket.on("match", async (data) => {
    console.log("Match event:", data);

    isSearching = false;
    isMatched = true;

    currentMatchId =
      data.matchId ||
      data.match_id ||
      null;

    currentPartnerId =
      data.partnerId ||
      data.partner_id ||
      data.userId ||
      null;

    isInitiator =
      Boolean(
        data.isInitiator
      );

    clearSearchTimer();

    if (!peerConnection) {
      createPeerConnection();
    }

    if (isInitiator) {
      try {
        await createOffer();
      } catch (error) {
        console.error(
          "Offer creation failed:",
          error
        );
      }
    }
  });

  socket.on(
    "webrtc-offer",
    async (data) => {
      console.log(
        "Received WebRTC offer"
      );

      if (!data) return;

      if (!peerConnection) {
        createPeerConnection();
      }

      try {
        const offer =
          data.offer ||
          data;

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(
            offer
          )
        );

        await flushIceCandidates();

        const answer =
          await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(
          answer
        );

        socket.emit(
          "webrtc-answer",
          {
            matchId:
              currentMatchId,
            partnerId:
              currentPartnerId,
            answer:
              peerConnection.localDescription
          }
        );
      } catch (error) {
        console.error(
          "WebRTC offer handling error:",
          error
        );

        setStatus(
          "Connection error"
        );
      }
    }
  );

  socket.on(
    "webrtc-answer",
    async (data) => {
      console.log(
        "Received WebRTC answer"
      );

      if (
        !peerConnection ||
        !data
      ) {
        return;
      }

      try {
        const answer =
          data.answer ||
          data;

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(
            answer
          )
        );

        await flushIceCandidates();
      } catch (error) {
        console.error(
          "WebRTC answer handling error:",
          error
        );

        setStatus(
          "Connection error"
        );
      }
    }
  );

  socket.on(
    "webrtc-ice-candidate",
    async (data) => {
      if (!data) return;

      const candidate =
        data.candidate ||
        data;

      if (!candidate) {
        return;
      }

      if (
        !peerConnection ||
        !peerConnection.remoteDescription
      ) {
        iceCandidateQueue.push(
          candidate
        );

        return;
      }

      try {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(
            candidate
          )
        );
      } catch (error) {
        console.warn(
          "ICE candidate error:",
          error
        );
      }
    }
  );

  socket.on(
    "webrtc-connected",
    () => {
      console.log(
        "WebRTC connected"
      );

      markConnected();
    }
  );

  socket.on(
    "connected",
    () => {
      console.log(
        "Socket connected event"
      );

      if (
        peerConnection &&
        peerConnection.connectionState ===
          "connected"
      ) {
        markConnected();
      }
    }
  );

  socket.on(
    "chat-message",
    (data) => {
      if (!data) return;

      const message =
        data.message ||
        data.text ||
        "";

      if (!message) return;

      addChatMessage(
        message,
        false
      );
    }
  );

  socket.on(
    "receive-message",
    (data) => {
      if (!data) return;

      const message =
        data.message ||
        data.text ||
        "";

      if (!message) return;

      addChatMessage(
        message,
        false
      );
    }
  );

  socket.on(
    "partner-left",
    () => {
      handlePartnerLeft();
    }
  );

  socket.on(
    "user-left",
    () => {
      handlePartnerLeft();
    }
  );

  socket.on(
    "chat-ended",
    () => {
      handlePartnerLeft();
    }
  );

  socket.on(
    "next-user",
    () => {
      handlePartnerLeft();
    }
  );

  socket.on(
    "error",
    (error) => {
      console.error(
        "Socket error:",
        error
      );

      if (
        error &&
        error.message
      ) {
        setStatus(
          error.message
        );
      }
    }
  );
}

/* -----------------------------------------
   REGISTER
----------------------------------------- */

function registerUser() {
  if (!socket) return;

  const auth =
    getAuthData();

  socket.emit(
    "register-user",
    {
      userId:
        auth.userId,
      userType:
        auth.isGuest
          ? "guest"
          : "user",
      token:
        auth.token || null
    }
  );
}

/* -----------------------------------------
   FIND RANDOM USER
----------------------------------------- */

function findRandomUser() {
  if (!socket) {
    setStatus(
      "Connecting to server..."
    );

    return;
  }

  if (
    !socket.connected
  ) {
    setStatus(
      "Connecting to server..."
    );

    return;
  }

  const auth =
    getAuthData();

  isSearching =
    true;

  isMatched =
    false;

  isConnected =
    false;

  currentMatchId =
    null;

  currentPartnerId =
    null;

  reportSubmitted =
    false;

  resetCallTimer();

  socket.emit(
    "find-random-user",
    {
      userId:
        auth.userId,
      userType:
        auth.isGuest
          ? "guest"
          : "user"
    }
  );

  setSearchingUI();

  startSearchTimer();
}

/* -----------------------------------------
   SEARCHING
----------------------------------------- */

function startSearching() {
  if (isSearching) {
    return;
  }

  if (
    !localStream ||
    !cameraEnabled
  ) {
    setStatus(
      "Please start your camera first."
    );

    return;
  }

  findRandomUser();
}

function startSearchTimer() {
  clearSearchTimer();

  let seconds = 0;

  searchTimer =
    setInterval(
      () => {
        seconds++;

        if (
          isSearching
        ) {
          setStatus(
            "Looking for someone... " +
              seconds +
              "s"
          );
        }
      },
      1000
    );
}

function clearSearchTimer() {
  if (searchTimer) {
    clearInterval(
      searchTimer
    );

    searchTimer =
      null;
  }
}

/* -----------------------------------------
   WEBRTC
----------------------------------------- */

function createPeerConnection() {
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch (error) {
      console.warn(
        "Old peer close error:",
        error
      );
    }
  }

  const configuration = {
    iceServers: [
      {
        urls:
          "stun:stun.l.google.com:19302"
      },
      {
        urls:
          "stun:stun1.l.google.com:19302"
      }
    ]
  };

  peerConnection =
    new RTCPeerConnection(
      configuration
    );

  iceCandidateQueue =
    [];

  if (localStream) {
    localStream
      .getTracks()
      .forEach(
        (track) => {
          try {
            peerConnection.addTrack(
              track,
              localStream
            );
          } catch (error) {
            console.error(
              "Add local track error:",
              error
            );
          }
        }
      );
  }

  peerConnection.ontrack =
    (event) => {
      console.log(
        "Remote track received"
      );

      if (!remoteVideo) {
        return;
      }

      const stream =
        event.streams &&
        event.streams[0];

      if (stream) {
        remoteVideo.srcObject =
          stream;

        remoteVideo.autoplay =
          true;

        remoteVideo.playsInline =
          true;

        remoteVideo
          .play()
          .catch(
            (error) => {
              console.warn(
                "Remote video play:",
                error
              );
            }
          );
      }

      if (remotePlaceholder) {
        remotePlaceholder.classList.add(
          "hidden"
        );
      }

      setStatus(
        "Connected"
      );
    };

  peerConnection.onicecandidate =
    (event) => {
      if (
        !event.candidate ||
        !socket
      ) {
        return;
      }

      socket.emit(
        "webrtc-ice-candidate",
        {
          matchId:
            currentMatchId,
          partnerId:
            currentPartnerId,
          candidate:
            event.candidate
        }
      );
    };

  peerConnection.onconnectionstatechange =
    () => {
      if (!peerConnection) {
        return;
      }

      const state =
        peerConnection.connectionState;

      console.log(
        "Peer connection state:",
        state
      );

      if (
        state === "connected"
      ) {
        markConnected();
      } else if (
        state === "connecting"
      ) {
        setStatus(
          "Connecting video..."
        );
      } else if (
        state === "disconnected"
      ) {
        setStatus(
          "Connection interrupted..."
        );
      } else if (
        state === "failed"
      ) {
        setStatus(
          "Video connection failed."
        );
      } else if (
        state === "closed"
      ) {
        isConnected =
          false;
      }
    };

  peerConnection.oniceconnectionstatechange =
    () => {
      if (!peerConnection) {
        return;
      }

      console.log(
        "ICE state:",
        peerConnection.iceConnectionState
      );
    };

  return peerConnection;
}

/* -----------------------------------------
   CREATE OFFER
----------------------------------------- */

async function createOffer() {
  if (!peerConnection) {
    createPeerConnection();
  }

  const offer =
    await peerConnection.createOffer({
      offerToReceiveAudio:
        true,
      offerToReceiveVideo:
        true
    });

  await peerConnection.setLocalDescription(
    offer
  );

  if (!socket) {
    throw new Error(
      "Socket unavailable"
    );
  }

  socket.emit(
    "webrtc-offer",
    {
      matchId:
        currentMatchId,
      partnerId:
        currentPartnerId,
      offer:
        peerConnection.localDescription
    }
  );
}

/* -----------------------------------------
   ICE QUEUE
----------------------------------------- */

async function flushIceCandidates() {
  if (
    !peerConnection ||
    !peerConnection.remoteDescription
  ) {
    return;
  }

  const queue =
    iceCandidateQueue;

  iceCandidateQueue =
    [];

  for (
    const candidate of queue
  ) {
    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      );
    } catch (error) {
      console.warn(
        "Queued ICE error:",
        error
      );
    }
  }
}
        peerConnection.connectionState;

      console.log(
        "Peer connection:",
        state
      );

      if (state === "connected") {
        markConnected();
      }

      if (
        state === "failed" ||
        state === "closed"
      ) {

        if (!isSearching &&
            isMatched &&
            !isConnected) {

          setStatus(
            "Connection failed"
          );
        }

        clearCallTimer();
      }

      if (
        state === "disconnected" &&
        isConnected
      ) {
        setStatus(
          "Connection unstable..."
        );
      }
    };

  peerConnection.oniceconnectionstatechange =
    () => {

      if (!peerConnection) {
        return;
      }

      console.log(
        "ICE state:",
        peerConnection.iceConnectionState
      );
    };

  return peerConnection;
}

/* -----------------------------------------
   CONNECTED
----------------------------------------- */

function markConnected() {

  if (isConnected) {
    return;
  }

  isConnected = true;
  isSearching = false;
  isMatched = true;

  setConnectedUI();

  if (socket &&
      currentMatchId) {

    socket.emit(
      "webrtc-connected",
      {
        matchId:
          currentMatchId
      }
    );
  }
}

/* -----------------------------------------
   OFFER
----------------------------------------- */

async function createOffer() {

  if (!peerConnection ||
      !socket ||
      !currentMatchId) {
    return;
  }

  try {

    const offer =
      await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

    await peerConnection.setLocalDescription(
      offer
    );

    if (!isConnected) {
      setStatus("Calling...");
    }

    socket.emit(
      "webrtc-offer",
      {
        matchId:
          currentMatchId,
        offer
      }
    );

  } catch (error) {

    console.error(
      "Create offer error:",
      error
    );
  }
}

/* -----------------------------------------
   ICE
----------------------------------------- */

async function flushIceCandidates() {

  if (
    !peerConnection ||
    !peerConnection.remoteDescription
  ) {
    return;
  }

  while (
    iceCandidateQueue.length
  ) {

    const candidate =
      iceCandidateQueue.shift();

    try {

      await peerConnection.addIceCandidate(
        candidate
      );

    } catch (error) {

      console.warn(
        "Queued ICE error:",
        error
      );
    }
  }
}

/* -----------------------------------------
   CLEANUP
----------------------------------------- */

function cleanupPeer() {

  if (peerConnection) {

    try {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
    } catch (error) {
      console.warn(
        "Peer cleanup:",
        error
      );
    }
  }

  peerConnection = null;

  iceCandidateQueue = [];

  if (remoteVideo) {
    try {
      remoteVideo.srcObject = null;
    } catch (error) {}
  }
}

/* -----------------------------------------
   NEXT USER
   No button.
   Called by swipe.
----------------------------------------- */

function nextUser() {

  if (!socket ||
      !socket.connected) {
    return;
  }

  cleanupPeer();

  clearCallTimer();

  isConnected = false;
  isMatched = false;
  isSearching = true;

  currentPartnerId = null;
  currentMatchId = null;

  reportSubmitted = false;

  resetChatBox();

  if (likeButton) {
    likeButton.disabled = true;
  }

  if (reportButton) {
    reportButton.disabled = true;
  }

  setSearchingUI();

  socket.emit(
    "next-user"
  );
}

/* -----------------------------------------
   SWIPE
----------------------------------------- */

function setupSwipe() {

  if (!videoArea) {
    return;
  }

  videoArea.addEventListener(
    "touchstart",
    (event) => {

      if (!event.touches ||
          !event.touches[0]) {
        return;
      }

      const touch =
        event.touches[0];

      touchStartX =
        touch.clientX;

      touchStartY =
        touch.clientY;

      touchStartTime =
        Date.now();
    },
    {
      passive: true
    }
  );

  videoArea.addEventListener(
    "touchend",
    (event) => {

      if (!event.changedTouches ||
          !event.changedTouches[0]) {
        return;
      }

      const touch =
        event.changedTouches[0];

      const deltaX =
        touch.clientX -
        touchStartX;

      const deltaY =
        touch.clientY -
        touchStartY;

      const elapsed =
        Date.now() -
        touchStartTime;

      const absX =
        Math.abs(deltaX);

      const absY =
        Math.abs(deltaY);

      /*
       * Horizontal swipe only.
       * Minimum 80px.
       */
      if (
        absX >= 80 &&
        absX > absY * 1.2 &&
        elapsed < 1000
      ) {

        /*
         * Swipe left or right:
         * both mean next person.
         */
        if (
          isMatched ||
          isConnected
        ) {
          nextUser();
        }
      }
    },
    {
      passive: true
    }
  );
}

/* -----------------------------------------
   END CHAT
----------------------------------------- */

function endChat() {

  if (socket &&
      socket.connected) {

    socket.emit(
      "end-chat",
      {
        matchId:
          currentMatchId
      }
    );
  }

  cleanupPeer();

  clearCallTimer();

  isSearching = false;
  isMatched = false;
  isConnected = false;

  currentPartnerId = null;
  currentMatchId = null;

  resetChatBox();

  if (likeButton) {
    likeButton.disabled = true;
  }

  if (reportButton) {
    reportButton.disabled = true;
  }

  setStatus(
    "Chat ended"
  );
}

/* -----------------------------------------
   CAMERA
----------------------------------------- */

function toggleCamera() {

  if (!localStream) {
    return;
  }

  const videoTracks =
    localStream.getVideoTracks();

  if (!videoTracks.length) {
    return;
  }

  cameraEnabled =
    !cameraEnabled;

  videoTracks.forEach(
    (track) => {
      track.enabled =
        cameraEnabled;
    }
  );

  if (cameraButton) {

    if (cameraEnabled) {

      cameraButton.textContent =
        "📷";

      cameraButton.classList.add(
        "active"
      );

      cameraButton.classList.remove(
        "camera-off"
      );

    } else {

      cameraButton.textContent =
        "🚫";

      cameraButton.classList.remove(
        "active"
      );

      cameraButton.classList.add(
        "camera-off"
      );
    }
  }
}

/* -----------------------------------------
   MICROPHONE
----------------------------------------- */

function toggleMicrophone() {

  if (!localStream) {
    return;
  }

  const audioTracks =
    localStream.getAudioTracks();

  if (!audioTracks.length) {
    return;
  }

  microphoneEnabled =
    !microphoneEnabled;

  audioTracks.forEach(
    (track) => {
      track.enabled =
        microphoneEnabled;
    }
  );

  if (micButton) {

    micButton.textContent =
      microphoneEnabled
        ? "🎤"
        : "🔇";
  }
}

/* -----------------------------------------
   COINS
----------------------------------------- */

function openCoins() {

  window.location.href =
    "profile.html";
}

/* -----------------------------------------
   REPORT
----------------------------------------- */

async function reportCurrentUser() {

  if (
    !currentPartnerId ||
    !currentMatchId
  ) {
    setStatus(
      "No person to report"
    );
    return;
  }

  if (reportSubmitted) {
    return;
  }

  const auth =
    getAuthData();

  if (!auth.userId) {
    setStatus(
      "Unable to identify your account"
    );
    return;
  }

  if (reportButton) {
    reportButton.disabled = true;
  }

  try {

    const headers = {
      "Content-Type":
        "application/json"
    };

    if (auth.token) {
      headers.Authorization =
        `Bearer ${auth.token}`;
    }

    const response =
      await fetch(
        `${VIZO_API}/reports`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            reporterId:
              auth.userId,

            reportedUserId:
              currentPartnerId,

            matchId:
              currentMatchId,

            reason:
              "Other"
          })
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch (error) {
      data = null;
    }

    if (
      !response.ok ||
      !data ||
      !data.success
    ) {

      throw new Error(
        data?.message ||
        "Unable to submit report."
      );
         }
         reportSubmitted = true;

    setStatus(
      "Report submitted"
    );

    /*
     * Keep the current chat active.
     * Reporting does not automatically
     * disconnect the user.
     */

  } catch (error) {

    console.error(
      "Report error:",
      error
    );

    setStatus(
      error.message ||
      "Unable to submit report"
    );

    if (reportButton) {
      reportButton.disabled = false;
    }
  }
}

/* -----------------------------------------
   LIKE
----------------------------------------- */

async function likeCurrentUser() {

  if (
    !currentPartnerId ||
    !currentMatchId
  ) {
    return;
  }

  const auth =
    getAuthData();

  if (!auth.userId) {
    setStatus(
      "Login required to like"
    );
    return;
  }

  if (!socket ||
      !socket.connected) {
    return;
  }

  if (likeButton) {
    likeButton.disabled = true;
  }

  try {

    const headers = {
      "Content-Type":
        "application/json"
    };

    if (auth.token) {
      headers.Authorization =
        `Bearer ${auth.token}`;
    }

    const response =
      await fetch(
        `${VIZO_API}/likes`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            senderId:
              auth.userId,

            receiverId:
              currentPartnerId,

            matchId:
              currentMatchId
          })
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {

      throw new Error(
        data?.message ||
        "Unable to send like."
      );
    }

    setStatus(
      data?.message ||
      "Like sent ❤️"
    );

  } catch (error) {

    console.error(
      "Like error:",
      error
    );

    setStatus(
      error.message ||
      "Unable to send like"
    );

    if (likeButton) {
      likeButton.disabled = false;
    }
  }
}

/* -----------------------------------------
   CHAT UI
----------------------------------------- */

function resetChatBox() {

  if (chatMessages) {
    chatMessages.innerHTML = "";
  }

  if (chatInput) {
    chatInput.value = "";
  }

  if (chatEmpty) {
    chatEmpty.classList.remove(
      "hidden"
    );
  }
}

function addChatMessage(
  message,
  isMine
) {

  if (!chatMessages) {
    return;
  }

  if (chatEmpty) {
    chatEmpty.classList.add(
      "hidden"
    );
  }

  const messageElement =
    document.createElement("div");

  messageElement.className =
    isMine
      ? "chat-message mine"
      : "chat-message";

  messageElement.textContent =
    message;

  chatMessages.appendChild(
    messageElement
  );

  chatMessages.scrollTop =
    chatMessages.scrollHeight;
}

function sendChatMessage() {

  if (!chatInput ||
      !socket ||
      !socket.connected) {
    return;
  }

  const message =
    chatInput.value.trim();

  if (!message) {
    return;
  }

  if (
    !currentMatchId ||
    !currentPartnerId
  ) {
    return;
  }

  socket.emit(
    "chat-message",
    {
      matchId:
        currentMatchId,

      receiverId:
        currentPartnerId,

      message
    }
  );

  addChatMessage(
    message,
    true
  );

  chatInput.value = "";
}

/* -----------------------------------------
   BUTTON SETUP
----------------------------------------- */

function setupButtons() {

  if (cameraButton) {

    cameraButton.addEventListener(
      "click",
      toggleCamera
    );
  }

  if (micButton) {

    micButton.addEventListener(
      "click",
      toggleMicrophone
    );
  }

  if (reportButton) {

    reportButton.addEventListener(
      "click",
      reportCurrentUser
    );
  }

  if (likeButton) {

    likeButton.addEventListener(
      "click",
      likeCurrentUser
    );
  }

  if (coinButton) {

    coinButton.addEventListener(
      "click",
      openCoins
    );
  }

  if (chatButton) {

    chatButton.addEventListener(
      "click",
      () => {

        if (chatPanel) {
          chatPanel.classList.add(
            "open"
          );
        }
      }
    );
  }

  if (chatCloseButton) {

    chatCloseButton.addEventListener(
      "click",
      () => {

        if (chatPanel) {
          chatPanel.classList.remove(
            "open"
          );
        }
      }
    );
  }

  if (chatForm) {

    chatForm.addEventListener(
      "submit",
      (event) => {

        event.preventDefault();

        sendChatMessage();
      }
    );
  }
}

/* -----------------------------------------
   INITIALIZE
----------------------------------------- */

async function initializeChat() {

  if (initialized) {
    return;
  }

  initialized = true;

  setupButtons();
  setupSwipe();

  try {

    setStatus(
      "Starting camera..."
    );

    await requestMedia();

    await connectSocket();

    startSearching();

  } catch (error) {

    console.error(
      "Chat initialization error:",
      error
    );

    setStatus(
      "Unable to start chat"
    );
  }
}

/* -----------------------------------------
   PAGE LOAD
----------------------------------------- */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeChat
  );

} else {

  initializeChat();
}

/* -----------------------------------------
   PAGE EXIT
----------------------------------------- */

window.addEventListener(
  "beforeunload",
  () => {

    try {

      if (socket &&
          socket.connected) {

        socket.emit(
          "end-chat",
          {
            matchId:
              currentMatchId
          }
        );
      }

    } catch (error) {

      console.warn(
        "Before unload:",
        error
      );
    }

    cleanupPeer();

    clearCallTimer();

    if (localStream) {

      localStream
        .getTracks()
        .forEach(
          (track) => {
            track.stop();
          }
        );

      localStream = null;
    }
  }
);
