"use strict";

/*
 * VizoChat - Random 1-to-1 Video Chat
 *
 * Flow:
 * Camera/Mic Permission
 *        ↓
 * Searching
 *        ↓
 * Match Found
 *        ↓
 * Connecting
 *        ↓
 * REAL WebRTC Connected
 */

const API_BASE =
  window.VizoAuth?.VIZOCHAT_API ||
  "https://website-r746.onrender.com/api";

const SOCKET_URL = "https://website-r746.onrender.com";

const CHAT_JS_VERSION = "2026-09-07-FINAL";

let socket = null;
let localStream = null;
let peerConnection = null;

let currentMatchId = null;
let currentPartnerId = null;

let isInitiator = false;
let isSearching = false;
let isConnected = false;

let socketRegistered = false;
let initializationStarted = false;

let matchStartedAt = null;
let timerInterval = null;

let pendingIceCandidates = [];

const ICE_SERVERS = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    }
  ]
};


/* =========================================================
   DOM
========================================================= */

const statusElement =
  document.getElementById("status");

const timerElement =
  document.getElementById("timer");

const guestCounterElement =
  document.getElementById("guestCounter");

const localVideo =
  document.getElementById("localVideo");

const remoteVideo =
  document.getElementById("remoteVideo");

const cameraButton =
  document.getElementById("cameraButton");

const micButton =
  document.getElementById("micButton");

const likeButton =
  document.getElementById("likeButton");

const reportButton =
  document.getElementById("reportButton");

const nextButton =
  document.getElementById("nextButton");

const localPlaceholder =
  document.getElementById("localPlaceholder");

const remotePlaceholder =
  document.getElementById("remotePlaceholder");

const statusText =
  document.getElementById("statusText");

const statusDot =
  document.getElementById("statusDot");


/* =========================================================
   UI
========================================================= */

function setStatus(message) {
  console.log("[VizoChat STATUS]", message);

  if (statusElement) {
    statusElement.textContent = message;
  }

  if (statusText) {
    statusText.textContent = message;
  }

  const connected =
    message.startsWith("Connected!");

  if (statusDot) {
    statusDot.classList.toggle(
      "connected",
      connected
    );
  }
}


function setTimer(seconds) {
  if (!timerElement) return;

  const safeSeconds =
    Math.max(0, Number(seconds) || 0);

  const minutes =
    Math.floor(safeSeconds / 60);

  const remainingSeconds =
    safeSeconds % 60;

  timerElement.textContent =
    String(minutes).padStart(2, "0") +
    ":" +
    String(remainingSeconds).padStart(2, "0");
}


function resetTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  matchStartedAt = null;

  setTimer(0);
}


function startTimer() {
  resetTimer();

  matchStartedAt = Date.now();

  timerInterval = setInterval(() => {
    if (!matchStartedAt) return;

    const elapsed =
      Math.floor(
        (Date.now() - matchStartedAt) / 1000
      );

    setTimer(elapsed);
  }, 1000);
}


function updateGuestCounter() {
  if (!guestCounterElement) return;

  if (
    window.VizoAuth &&
    window.VizoAuth.isLoggedIn()
  ) {
    guestCounterElement.textContent =
      "Logged in";

    return;
  }

  const used =
    window.VizoAuth?.getGuestMatchCount?.() || 0;

  const limit =
    window.VizoAuth?.GUEST_MATCH_LIMIT || 10;

  guestCounterElement.textContent =
    `${used}/${limit} matches used`;
}


function clearRemoteVideo() {
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }

  if (remotePlaceholder) {
    remotePlaceholder.style.display = "flex";
  }
}


function showLocalVideo() {
  if (localPlaceholder) {
    localPlaceholder.style.display = "none";
  }
}


function showRemoteVideo() {
  if (remotePlaceholder) {
    remotePlaceholder.style.display = "none";
  }
}


function disableChatControls() {
  if (likeButton) {
    likeButton.disabled = true;
  }

  if (reportButton) {
    reportButton.disabled = true;
  }
}


function enableChatControls() {
  if (likeButton) {
    likeButton.disabled = false;
  }

  if (reportButton) {
    reportButton.disabled = false;
  }
}


function resetChatUI() {
  isConnected = false;

  resetTimer();

  clearRemoteVideo();

  disableChatControls();
}


/* =========================================================
   SOCKET.IO
========================================================= */

function loadSocketIO() {
  return new Promise((resolve, reject) => {

    if (window.io) {
      resolve();

      return;
    }

    const existingScript =
      document.querySelector(
        'script[src*="socket.io"]'
      );

    if (existingScript) {

      existingScript.addEventListener(
        "load",
        () => resolve(),
        { once: true }
      );

      existingScript.addEventListener(
        "error",
        () => reject(
          new Error(
            "Unable to load video chat service."
          )
        ),
        { once: true }
      );

      return;
    }

    const script =
      document.createElement("script");

    script.src =
      "https://cdn.socket.io/4.8.1/socket.io.min.js";

    script.onload = () => {
      resolve();
    };

    script.onerror = () => {
      reject(
        new Error(
          "Unable to load video chat service."
        )
      );
    };

    document.head.appendChild(script);
  });
}


async function connectSocket() {

  await loadSocketIO();

  if (socket) {

    if (socket.connected) {
      return socket;
    }

    try {
      socket.connect();

      return socket;

    } catch (error) {
      console.error(
        "Socket reconnect error:",
        error
      );
    }
  }

  setStatus(
    "Connecting to VizoChat server..."
  );

  socket =
    window.io(
      SOCKET_URL,
      {
        transports: [
          "websocket",
          "polling"
        ],

        reconnection: true,

        reconnectionAttempts: 10,

        reconnectionDelay: 1000,

        timeout: 10000
      }
    );

  setupSocketEvents();

  return socket;
}


/* =========================================================
   SOCKET EVENTS
========================================================= */

function setupSocketEvents() {

  if (!socket) return;


  socket.on(
    "connect",
    () => {

      console.log(
        "[VizoChat] Socket connected:",
        socket.id
      );

      socketRegistered = false;

      registerUser();
    }
  );


  socket.on(
    "connect_error",
    (error) => {

      console.error(
        "[VizoChat] Socket connection error:",
        error
      );

      setStatus(
        "Unable to connect to VizoChat server."
      );
    }
  );


  socket.on(
    "waiting-for-user",
    (data) => {

      console.log(
        "[VizoChat] Waiting:",
        data
      );

      isSearching = true;

      isConnected = false;

      resetTimer();

      clearRemoteVideo();

      disableChatControls();

      setStatus(
        "Searching for someone..."
      );
    }
  );


  socket.on(
    "match-found",
    async (data) => {

      console.log(
        "[VizoChat] Match found:",
        data
      );

      await handleMatchFound(data);
    }
  );


  socket.on(
    "webrtc-offer",
    async (data) => {

      console.log(
        "[VizoChat] WebRTC offer received."
      );

      await handleOffer(data);
    }
  );


  socket.on(
    "webrtc-answer",
    async (data) => {

      console.log(
        "[VizoChat] WebRTC answer received."
      );

      await handleAnswer(data);
    }
  );


  socket.on(
    "webrtc-ice-candidate",
    async (data) => {

      await handleIceCandidate(data);
    }
  );


  socket.on(
    "partner-disconnected",
    () => {

      console.log(
        "[VizoChat] Partner disconnected."
      );

      cleanupPeerConnection();

      currentMatchId = null;

      currentPartnerId = null;

      isInitiator = false;

      isConnected = false;

      isSearching = false;

      resetTimer();

      clearRemoteVideo();

      disableChatControls();

      setStatus(
        "Stranger disconnected. Searching for someone new..."
      );

      setTimeout(() => {

        if (!isSearching) {
          startSearching();
        }

      }, 1000);
    }
  );


  socket.on(
    "guest-limit-reached",
    () => {

      isSearching = false;

      isConnected = false;

      resetTimer();

      disableChatControls();

      setStatus(
        "Your 10 guest matches are finished. Please login with Google."
      );
    }
  );


  socket.on(
    "match-error",
    (data) => {

      console.error(
        "[VizoChat] Match error:",
        data
      );

      isSearching = false;

      isConnected = false;

      resetTimer();

      setStatus(
        data?.message ||
        "Unable to find a match."
      );
    }
  );


  socket.on(
    "server-error",
    (data) => {

      console.error(
        "[VizoChat] Server error:",
        data
      );

      setStatus(
        data?.message ||
        "VizoChat server error."
      );
    }
  );


  socket.on(
    "disconnect",
    (reason) => {

      console.log(
        "[VizoChat] Socket disconnected:",
        reason
      );

      socketRegistered = false;

      isSearching = false;

      isConnected = false;

      resetTimer();

      setStatus(
        "Disconnected from VizoChat server."
      );
    }
  );
}


/* =========================================================
   REGISTER USER
========================================================= */

function registerUser() {

  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  if (socketRegistered) {
    return;
  }

  const userId =
    window.VizoAuth?.getUserId?.() ||
    `guest-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}`;

  const userType =
    window.VizoAuth?.getUserType?.() ||
    "guest";

  socket.emit(
    "register-user",
    {
      userId,
      userType,

      /*
       * Compatibility with backend versions
       * that expect isGuest.
       */
      isGuest:
        userType === "guest"
    }
  );

  socketRegistered = true;

  console.log(
    "[VizoChat] User registered:",
    {
      userId,
      userType
    }
  );
}


/* =========================================================
   CAMERA + MICROPHONE
========================================================= */

async function requestCameraAndMic() {

  setStatus(
    "Requesting camera and microphone permission..."
  );

  if (
    !window.isSecureContext
  ) {

    throw new Error(
      "Camera and microphone require a secure HTTPS connection."
    );
  }

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    throw new Error(
      "Camera and microphone are not supported by this browser."
    );
  }

  try {

    localStream =
      await navigator.mediaDevices.getUserMedia(
        {
          video: {
            facingMode: "user"
          },

          audio: true
        }
      );

    console.log(
      "[VizoChat] Camera and microphone permission granted."
    );

    if (localVideo) {

      localVideo.srcObject =
        localStream;

      localVideo.muted = true;

      localVideo.playsInline = true;

      try {
        await localVideo.play();
      } catch (error) {
        console.warn(
          "Local video autoplay blocked:",
          error
        );
      }
    }

    showLocalVideo();

    updateMediaButtons();

    return localStream;

  } catch (error) {

    console.error(
      "[VizoChat] Media error:",
      error
    );

    if (
      error.name ===
      "NotAllowedError"
    ) {

      throw new Error(
        "Camera and microphone permission was denied. Please allow Camera and Microphone for VizoChat and reload the page."
      );
    }

    if (
      error.name ===
      "NotFoundError"
    ) {

      throw new Error(
        "Camera or microphone was not found on this device."
      );
    }

    if (
      error.name ===
      "NotReadableError"
    ) {

      throw new Error(
        "Camera or microphone is already being used by another app."
      );
    }

    throw new Error(
      "Unable to access camera and microphone."
    );
  }
}


/* =========================================================
   WEBRTC
========================================================= */

function createPeerConnection() {

  cleanupPeerConnection();

  pendingIceCandidates = [];

  peerConnection =
    new RTCPeerConnection(
      ICE_SERVERS
    );

  console.log(
    "[VizoChat] RTCPeerConnection created."
  );


  if (localStream) {

    localStream
      .getTracks()
      .forEach((track) => {

        peerConnection.addTrack(
          track,
          localStream
        );
      });
  }


  peerConnection.ontrack =
    (event) => {

      console.log(
        "[VizoChat] Remote track received."
      );

      const stream =
        event.streams &&
        event.streams[0];

      if (
        stream &&
        remoteVideo
      ) {

        remoteVideo.srcObject =
          stream;

        showRemoteVideo();

        remoteVideo
          .play()
          .catch((error) => {

            console.warn(
              "Remote video autoplay blocked:",
              error
            );
          });
      }
    };


  peerConnection.onicecandidate =
    (event) => {

      if (
        !event.candidate ||
        !socket ||
        !socket.connected ||
        !currentMatchId
      ) {
        return;
      }

      socket.emit(
        "webrtc-ice-candidate",
        {
          matchId:
            currentMatchId,

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
        "[VizoChat] WebRTC connection state:",
        state
      );


      if (
        state === "connected"
      ) {

        handleWebRTCConnected();

        return;
      }


      if (
        state === "failed"
      ) {

        isConnected = false;

        resetTimer();

        setStatus(
          "Video connection failed. Press Next to try another person."
        );

        return;
      }


      if (
        state === "disconnected"
      ) {

        isConnected = false;

        setStatus(
          "Video connection interrupted..."
        );

        return;
      }


      if (
        state === "closed"
      ) {

        isConnected = false;

        resetTimer();
      }
    };


  peerConnection.oniceconnectionstatechange =
    () => {

      if (!peerConnection) {
        return;
      }

      console.log(
        "[VizoChat] ICE state:",
        peerConnection.iceConnectionState
      );
    };


  return peerConnection;
}


/* =========================================================
   ICE QUEUE
========================================================= */

async function addPendingIceCandidates() {

  if (!peerConnection) {
    return;
  }

  if (
    !peerConnection.remoteDescription ||
    !peerConnection.remoteDescription.type
  ) {
    return;
  }

  const candidates =
    [...pendingIceCandidates];

  pendingIceCandidates = [];

  for (
    const candidate of candidates
  ) {

    try {

      await peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );

    } catch (error) {

      console.error(
        "[VizoChat] Queued ICE error:",
        error
      );
    }
  }
}


/* =========================================================
   MATCH FOUND
========================================================= */

async function handleMatchFound(data) {

  if (!data) {
    return;
  }

  currentMatchId =
    data.matchId ||
    data.matchID ||
    null;

  currentPartnerId =
    data.partnerId ||
    data.otherUserId ||
    data.partnerSocketId ||
    null;

  isInitiator =
    data.initiator === true;

  isSearching = false;

  isConnected = false;

  resetTimer();

  clearRemoteVideo();

  disableChatControls();


  if (!currentMatchId) {

    console.error(
      "[VizoChat] Match received without matchId."
    );

    setStatus(
      "Invalid match received. Press Next."
    );

    return;
  }


  setStatus(
    "Match found. Connecting video..."
  );

  console.log(
    "[VizoChat] MATCH:",
    {
      matchId:
        currentMatchId,

      partnerId:
        currentPartnerId,

      initiator:
        isInitiator
    }
  );


  createPeerConnection();


  if (isInitiator) {

    await createAndSendOffer();
  }
}


/* =========================================================
   OFFER
========================================================= */

async function createAndSendOffer() {

  if (
    !peerConnection ||
    !socket ||
    !socket.connected ||
    !currentMatchId
  ) {
    return;
  }

  try {

    setStatus(
      "Connecting video..."
    );

    const offer =
      await peerConnection.createOffer(
        {
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        }
      );

    await peerConnection.setLocalDescription(
      offer
    );

    socket.emit(
      "webrtc-offer",
      {
        matchId:
          currentMatchId,

        offer:
          peerConnection.localDescription
      }
    );

    console.log(
      "[VizoChat] WebRTC offer sent."
    );

  } catch (error) {

    console.error(
      "[VizoChat] Offer error:",
      error
    );

    setStatus(
      "Unable to start video connection."
    );
  }
}


/* =========================================================
   RECEIVE OFFER
========================================================= */

async function handleOffer(data) {

  if (
    !data ||
    !data.offer
  ) {
    return;
  }

  if (!peerConnection) {
    createPeerConnection();
  }

  try {

    setStatus(
      "Connecting video..."
    );

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        data.offer
      )
    );

    await addPendingIceCandidates();


    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );


    if (
      socket &&
      socket.connected
    ) {

      socket.emit(
        "webrtc-answer",
        {
          matchId:
            data.matchId ||
            currentMatchId,

          answer:
            peerConnection.localDescription
        }
      );
    }

    console.log(
      "[VizoChat] WebRTC answer sent."
    );

  } catch (error) {

    console.error(
      "[VizoChat] Offer handling error:",
      error
    );

    setStatus(
      "Unable to connect video."
    );
  }
}


/* =========================================================
   RECEIVE ANSWER
========================================================= */

async function handleAnswer(data) {

  if (
    !data ||
    !data.answer ||
    !peerConnection
  ) {
    return;
  }

  try {

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        data.answer
      )
    );

    await addPendingIceCandidates();

    console.log(
      "[VizoChat] WebRTC answer applied."
    );

  } catch (error) {

    console.error(
      "[VizoChat] Answer error:",
      error
    );
  }
}


/* =========================================================
   RECEIVE ICE
========================================================= */

async function handleIceCandidate(data) {

  if (
    !data ||
    !data.candidate
  ) {
    return;
  }


  if (
    !peerConnection ||
    !peerConnection.remoteDescription ||
    !peerConnection.remoteDescription.type
  ) {

    pendingIceCandidates.push(
      data.candidate
    );

    return;
  }


  try {

    await peerConnection.addIceCandidate(
      new RTCIceCandidate(
        data.candidate
      )
    );

  } catch (error) {

    console.error(
      "[VizoChat] ICE candidate error:",
      error
    );
  }
}


/* =========================================================
   REAL WEBRTC CONNECTED
========================================================= */

function handleWebRTCConnected() {

  if (isConnected) {
    return;
  }

  isConnected = true;

  isSearching = false;


  /*
   * IMPORTANT:
   * "Connected" is shown ONLY after
   * RTCPeerConnection says connected.
   */

  setStatus(
    "Connected! You are now chatting with someone new."
  );


  startTimer();


  enableChatControls();


  if (
    socket &&
    socket.connected &&
    currentMatchId
  ) {

    socket.emit(
      "webrtc-connected",
      {
        matchId:
          currentMatchId
      }
    );
  }


  console.log(
    "[VizoChat] REAL WEBRTC CONNECTION ESTABLISHED."
  );
}


/* =========================================================
   SEARCH
========================================================= */

async function startSearching() {

  if (isSearching) {
    return;
  }


  if (
    window.VizoAuth &&
    !window.VizoAuth.isLoggedIn() &&
    !window.VizoAuth.canGuestStartMatch()
  ) {

    setStatus(
      "Your 10 guest matches are finished. Please login with Google."
    );

    return;
  }


  isSearching = true;

  isConnected = false;


  cleanupPeerConnection();


  currentMatchId = null;

  currentPartnerId = null;

  isInitiator = false;


  resetTimer();

  clearRemoteVideo();

  disableChatControls();


  setStatus(
    "Searching for someone..."
  );


  if (!socket) {

    await connectSocket();
  }


  if (
    !socket ||
    !socket.connected
  ) {

    isSearching = false;

    setStatus(
      "Unable to connect to VizoChat server."
    );

    return;
  }


  if (!socketRegistered) {

    registerUser();
  }


  socket.emit(
    "find-random-user"
  );


  console.log(
    "[VizoChat] Searching for random user..."
  );
}


/* =========================================================
   NEXT USER
========================================================= */

function nextUser() {

  if (!socket) {
    return;
  }


  console.log(
    "[VizoChat] Next user requested."
  );


  if (currentMatchId) {

    socket.emit(
      "next-user",
      {
        matchId:
          currentMatchId
      }
    );
  }


  cleanupPeerConnection();


  currentMatchId = null;

  currentPartnerId = null;

  isInitiator = false;

  isConnected = false;

  isSearching = false;


  resetTimer();

  clearRemoteVideo();

  disableChatControls();


  setStatus(
    "Searching for someone..."
  );


  setTimeout(() => {

    startSearching();

  }, 300);
}


/* =========================================================
   END CHAT
========================================================= */

function endChat() {

  console.log(
    "[VizoChat] Ending chat."
  );


  if (
    socket &&
    socket.connected &&
    currentMatchId
  ) {

    socket.emit(
      "end-chat",
      {
        matchId:
          currentMatchId
      }
    );
  }


  cleanupPeerConnection();


  currentMatchId = null;

  currentPartnerId = null;

  isInitiator = false;

  isSearching = false;

  isConnected = false;


  resetTimer();

  clearRemoteVideo();

  disableChatControls();


  setStatus(
    "Chat ended. Press Next to find someone."
  );
}


/* =========================================================
   MEDIA CONTROLS
========================================================= */

function updateMediaButtons() {

  if (!localStream) {
    return;
  }


  const videoTrack =
    localStream.getVideoTracks()[0];

  const audioTrack =
    localStream.getAudioTracks()[0];


  if (cameraButton) {

    cameraButton.textContent =
      videoTrack?.enabled
        ? "📷 Camera On"
        : "🚫 Camera Off";
  }


  if (micButton) {

    micButton.textContent =
      audioTrack?.enabled
        ? "🎤 Mic On"
        : "🔇 Mic Off";
  }
}


function toggleCamera() {

  if (!localStream) {
    return;
  }


  const tracks =
    localStream.getVideoTracks();


  tracks.forEach((track) => {

    track.enabled =
      !track.enabled;
  });


  updateMediaButtons();
}


function toggleMic() {

  if (!localStream) {
    return;
  }


  const tracks =
    localStream.getAudioTracks();


  tracks.forEach((track) => {

    track.enabled =
      !track.enabled;
  });


  updateMediaButtons();
}


/* =========================================================
   CLEANUP
========================================================= */

function cleanupPeerConnection() {

  pendingIceCandidates = [];


  if (peerConnection) {

    try {

      peerConnection.ontrack = null;

      peerConnection.onicecandidate = null;

      peerConnection.onconnectionstatechange =
        null;

      peerConnection.oniceconnectionstatechange =
        null;

      peerConnection.close();

    } catch (error) {

      console.warn(
        "[VizoChat] Peer cleanup error:",
        error
      );
    }
  }


  peerConnection = null;
}


/* =========================================================
   BUTTON EVENTS
========================================================= */

if (cameraButton) {

  cameraButton.addEventListener(
    "click",
    toggleCamera
  );
}


if (micButton) {

  micButton.addEventListener(
    "click",
    toggleMic
  );
}


if (nextButton) {

  nextButton.addEventListener(
    "click",
    nextUser
  );
}


/* =========================================================
   INITIALIZE
========================================================= */

async function initializeChat() {

  if (initializationStarted) {
    return;
  }

  initializationStarted = true;


  console.log(
    `[VizoChat] chat.js ${CHAT_JS_VERSION} loaded.`
  );


  updateGuestCounter();

  disableChatControls();

  resetTimer();

  clearRemoteVideo();


  try {

    /*
     * STEP 1
     * Camera + microphone permission.
     */

    await requestCameraAndMic();


    /*
     * STEP 2
     * Connect Socket.IO.
     */

    await connectSocket();


    /*
     * STEP 3
     * Socket connected.
     * register-user is handled by
     * socket "connect" event.
     */

    if (
      socket &&
      socket.connected
    ) {

      if (!socketRegistered) {
        registerUser();
      }

      /*
       * STEP 4
       * Start random matching.
       */

      await startSearching();

    } else {

      setStatus(
        "Connecting to VizoChat server..."
      );
    }

  } catch (error) {

    console.error(
      "[VizoChat] Initialization error:",
      error
    );

    isSearching = false;

    isConnected = false;

    setStatus(
      error.message ||
      "Unable to start VizoChat."
    );
  }
}


/* =========================================================
   PUBLIC API
========================================================= */

window.VizoChat = {

  startSearching,

  nextUser,

  endChat,

  toggleCamera,

  toggleMic,

  getState: () => ({
    version:
      CHAT_JS_VERSION,

    searching:
      isSearching,

    connected:
      isConnected,

    matchId:
      currentMatchId,

    partnerId:
      currentPartnerId,

    socketConnected:
      Boolean(socket?.connected),

    socketRegistered:
      socketRegistered,

    peerConnectionState:
      peerConnection?.connectionState ||
      "not-created"
  })
};


/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initializeChat();
  }
);


/* =========================================================
   PAGE CLOSE
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (socket) {
      socket.disconnect();
    }


    cleanupPeerConnection();


    if (localStream) {

      localStream
        .getTracks()
        .forEach((track) => {
          track.stop();
        });
    }
  }
);
