"use strict";

/*
 * VizoChat - Random 1-to-1 Video Chat
 *
 * Flow:
 * Searching -> Camera/Mic Permission -> Waiting
 * -> Match Found -> Connecting -> WebRTC Connected
 */

const API_BASE =
  window.VizoAuth?.VIZOCHAT_API ||
  "https://website-r746.onrender.com/api";

const SOCKET_URL = "https://website-r746.onrender.com";

let socket = null;
let localStream = null;
let peerConnection = null;

let currentMatchId = null;
let currentPartnerId = null;
let isInitiator = false;
let isSearching = false;
let isConnected = false;

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

/* ---------------- DOM ---------------- */

const statusElement = document.getElementById("status");
const timerElement = document.getElementById("timer");
const guestCounterElement = document.getElementById("guestCounter");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const cameraButton = document.getElementById("cameraButton");
const micButton = document.getElementById("micButton");
const likeButton = document.getElementById("likeButton");
const reportButton = document.getElementById("reportButton");
const nextButton = document.getElementById("nextButton");

/* ---------------- UI ---------------- */

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function setTimer(seconds) {
  if (!timerElement) return;

  const safeSeconds = Math.max(0, Number(seconds) || 0);

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

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

    const elapsed = Math.floor(
      (Date.now() - matchStartedAt) / 1000
    );

    setTimer(elapsed);
  }, 1000);
}

function updateGuestCounter() {
  if (!guestCounterElement) return;

  if (window.VizoAuth?.isLoggedIn()) {
    guestCounterElement.textContent = "Logged in";
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
}

/* ---------------- SOCKET.IO ---------------- */

function loadSocketIO() {
  return new Promise((resolve, reject) => {
    if (window.io) {
      resolve();
      return;
    }

    const existingScript = document.querySelector(
      'script[src*="socket.io"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", resolve);
      existingScript.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");

    script.src =
      "https://cdn.socket.io/4.8.1/socket.io.min.js";

    script.onload = resolve;

    script.onerror = () => {
      reject(
        new Error("Unable to load video chat service.")
      );
    };

    document.head.appendChild(script);
  });
}

/* ---------------- MEDIA ---------------- */

async function requestCameraAndMic() {
  setStatus("Requesting camera and microphone permission...");

  if (!navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia) {

    throw new Error(
      "Camera and microphone are not supported by this browser."
    );
  }

  try {
    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

    if (localVideo) {
      localVideo.srcObject = localStream;

      try {
        await localVideo.play();
      } catch (error) {
        console.warn(
          "Local video autoplay was blocked:",
          error
        );
      }
    }

    updateMediaButtons();

    return localStream;

  } catch (error) {
    console.error(
      "Camera/Microphone permission error:",
      error
    );

    if (error.name === "NotAllowedError") {
      throw new Error(
        "Camera and microphone permission is required. Please allow both permissions and try again."
      );
    }

    if (error.name === "NotFoundError") {
      throw new Error(
        "Camera or microphone was not found on this device."
      );
    }

    throw new Error(
      "Unable to access camera and microphone."
    );
  }
}

/* ---------------- PEER CONNECTION ---------------- */

function createPeerConnection() {
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch (error) {
      console.warn(error);
    }
  }

  pendingIceCandidates = [];

  peerConnection =
    new RTCPeerConnection(ICE_SERVERS);

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(
        track,
        localStream
      );
    });
  }

  peerConnection.ontrack = (event) => {
    console.log("REMOTE TRACK RECEIVED");

    const stream =
      event.streams && event.streams[0];

    if (stream && remoteVideo) {
      remoteVideo.srcObject = stream;

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

  peerConnection.onicecandidate = (event) => {
    if (
      !event.candidate ||
      !socket ||
      !currentMatchId
    ) {
      return;
    }

    socket.emit(
      "webrtc-ice-candidate",
      {
        matchId: currentMatchId,
        candidate: event.candidate
      }
    );
  };

  peerConnection.onconnectionstatechange = () => {
    if (!peerConnection) return;

    const state =
      peerConnection.connectionState;

    console.log(
      "WebRTC connection state:",
      state
    );

    if (state === "connected") {
      handleWebRTCConnected();
    }

    if (state === "failed") {
      isConnected = false;
      resetTimer();

      setStatus(
        "Connection failed. Please press Next."
      );
    }

    if (state === "disconnected") {
      isConnected = false;

      setStatus(
        "Connection interrupted..."
      );
    }

    if (state === "closed") {
      isConnected = false;
      resetTimer();
    }
  };

  peerConnection.oniceconnectionstatechange =
    () => {
      if (!peerConnection) return;

      console.log(
        "ICE state:",
        peerConnection.iceConnectionState
      );
    };

  return peerConnection;
}

async function addPendingIceCandidates() {
  if (!peerConnection) return;

  if (
    !peerConnection.remoteDescription ||
    !peerConnection.remoteDescription.type
  ) {
    return;
  }

  const candidates = [...pendingIceCandidates];

  pendingIceCandidates = [];

  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error(
        "Unable to add queued ICE candidate:",
        error
      );
    }
  }
}

/* ---------------- MATCH FOUND ---------------- */

async function handleMatchFound(data) {
  if (!data) return;

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

  setStatus(
    "Match found. Connecting video..."
  );

  console.log(
    "MATCH FOUND:",
    {
      matchId: currentMatchId,
      partnerId: currentPartnerId,
      initiator: isInitiator
    }
  );

  createPeerConnection();

  if (isInitiator) {
    await createAndSendOffer();
  }
}

/* ---------------- OFFER ---------------- */

async function createAndSendOffer() {
  if (!peerConnection || !socket) return;

  try {
    setStatus("Connecting video...");

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    socket.emit(
      "webrtc-offer",
      {
        matchId: currentMatchId,
        offer: peerConnection.localDescription
      }
    );

    console.log("WebRTC offer sent.");

  } catch (error) {
    console.error(
      "Offer creation error:",
      error
    );

    setStatus(
      "Unable to start video connection."
    );
  }
}

/* ---------------- OFFER RECEIVE ---------------- */

async function handleOffer(data) {
  if (!data || !data.offer) return;

  if (!peerConnection) {
    createPeerConnection();
  }

  try {
    setStatus("Connecting video...");

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );

    await addPendingIceCandidates();

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );

    if (socket) {
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

    console.log("WebRTC answer sent.");

  } catch (error) {
    console.error(
      "Offer handling error:",
      error
    );

    setStatus(
      "Unable to connect video."
    );
  }
}

/* ---------------- ANSWER RECEIVE ---------------- */

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
      new RTCSessionDescription(data.answer)
    );

    await addPendingIceCandidates();

    console.log("WebRTC answer received.");

  } catch (error) {
    console.error(
      "Answer handling error:",
      error
    );
  }
}

/* ---------------- ICE RECEIVE ---------------- */

async function handleIceCandidate(data) {
  if (!data || !data.candidate) return;

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
      new RTCIceCandidate(data.candidate)
    );
  } catch (error) {
    console.error(
      "ICE candidate error:",
      error
    );
  }
}

/* ---------------- REAL CONNECTION ---------------- */

function handleWebRTCConnected() {
  if (isConnected) return;

  isConnected = true;

  setStatus(
    "Connected! You are now chatting with someone new."
  );

  /*
   * IMPORTANT:
   * Timer starts ONLY after actual WebRTC
   * connection is established.
   */
  startTimer();

  /*
   * Tell backend that WebRTC is actually connected.
   */
  if (socket && currentMatchId) {
    socket.emit(
      "webrtc-connected",
      {
        matchId: currentMatchId
      }
    );
  }

  updateControlsForConnected();
}

/* ---------------- SEARCH ---------------- */

async function startSearching() {
  if (isSearching) return;

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

  currentMatchId = null;
  currentPartnerId = null;
  isInitiator = false;

  resetTimer();
  clearRemoteVideo();

  disableChatControls();

  setStatus("Searching for someone...");

  if (!socket) {
    await connectSocket();
  }

  if (!socket || !socket.connected) {
    setStatus(
      "Unable to connect to VizoChat server."
    );

    isSearching = false;

    return;
  }

  socket.emit(
    "find-random-user"
  );
}

/* ---------------- SOCKET CONNECTION ---------------- */

async function connectSocket() {
  await loadSocketIO();

  if (socket && socket.connected) {
    return socket;
  }

  setStatus(
    "Connecting to VizoChat server..."
  );

  socket = window.io(
    SOCKET_URL,
    {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5
    }
  );

  setupSocketEvents();

  return socket;
}

/* ---------------- SOCKET EVENTS ---------------- */

function setupSocketEvents() {
  if (!socket) return;

  socket.on(
    "connect",
    () => {
      console.log(
        "Socket connected:",
        socket.id
      );

      registerUser();
    }
  );

  socket.on(
    "connect_error",
    (error) => {
      console.error(
        "Socket connection error:",
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
        "WAITING:",
        data
      );

      isSearching = true;
      isConnected = false;

      resetTimer();

      clearRemoteVideo();

      setStatus(
        "Searching for someone..."
      );
    }
  );

  socket.on(
    "match-found",
    async (data) => {
      console.log(
        "MATCH FOUND:",
        data
      );

      await handleMatchFound(
        data
      );
    }
  );

  socket.on(
    "webrtc-offer",
    async (data) => {
      await handleOffer(data);
    }
  );

  socket.on(
    "webrtc-answer",
    async (data) => {
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
      isConnected = false;
      isSearching = false;

      resetTimer();

      clearRemoteVideo();

      setStatus(
        "Stranger disconnected. Searching for someone new..."
      );

      /*
       * Automatically search for another person.
       */
      setTimeout(() => {
        startSearching();
      }, 1000);
    }
  );

  socket.on(
    "guest-limit-reached",
    () => {
      isSearching = false;

      resetTimer();

      setStatus(
        "Your 10 guest matches are finished. Please login with Google."
      );
    }
  );

  socket.on(
    "match-error",
    (data) => {
      console.error(
        "Match error:",
        data
      );

      isSearching = false;

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
        "Server error:",
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
    () => {
      console.log(
        "Socket disconnected."
      );

      isSearching = false;
      isConnected = false;

      resetTimer();

      setStatus(
        "Disconnected from server."
      );
    }
  );
}

/* ---------------- REGISTER ---------------- */

function registerUser() {
  if (!socket || !socket.connected) {
    return;
  }

  const userId =
    window.VizoAuth?.getUserId?.() ||
    `guest-${Date.now()}`;

  const userType =
    window.VizoAuth?.getUserType?.() ||
    "guest";

  socket.emit(
    "register-user",
    {
      userId,
      userType
    }
  );

  console.log(
    "Registered:",
    {
      userId,
      userType
    }
  );
}

/* ---------------- CONTROLS ---------------- */

function updateMediaButtons() {
  if (!localStream) return;

  const videoTrack =
    localStream.getVideoTracks()[0];

  const audioTrack =
    localStream.getAudioTracks()[0];

  if (cameraButton) {
    cameraButton.textContent =
      videoTrack?.enabled
        ? "Camera On"
        : "Camera Off";
  }

  if (micButton) {
    micButton.textContent =
      audioTrack?.enabled
        ? "Mic On"
        : "Mic Off";
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

function updateControlsForConnected() {
  if (likeButton) {
    likeButton.disabled = false;
  }

  if (reportButton) {
    reportButton.disabled = false;
  }
}

function toggleCamera() {
  if (!localStream) return;

  const tracks =
    localStream.getVideoTracks();

  tracks.forEach((track) => {
    track.enabled = !track.enabled;
  });

  updateMediaButtons();
}

function toggleMic() {
  if (!localStream) return;

  const tracks =
    localStream.getAudioTracks();

  tracks.forEach((track) => {
    track.enabled = !track.enabled;
  });

  updateMediaButtons();
}

/* ---------------- NEXT ---------------- */

function nextUser() {
  if (!socket) return;

  if (currentMatchId) {
    socket.emit(
      "next-user",
      {
        matchId: currentMatchId
      }
    );
  }

  cleanupPeerConnection();

  currentMatchId = null;
  currentPartnerId = null;

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

/* ---------------- END CHAT ---------------- */

function endChat() {
  if (socket && currentMatchId) {
    socket.emit(
      "end-chat",
      {
        matchId: currentMatchId
      }
    );
  }

  cleanupPeerConnection();

  currentMatchId = null;
  currentPartnerId = null;

  isSearching = false;
  isConnected = false;

  resetTimer();
  clearRemoteVideo();

  disableChatControls();

  setStatus(
    "Chat ended. Press Next to find someone."
  );
}

/* ---------------- CLEANUP ---------------- */

function cleanupPeerConnection() {
  pendingIceCandidates = [];

  if (peerConnection) {
    try {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.close();
    } catch (error) {
      console.warn(
        "Peer cleanup error:",
        error
      );
    }
  }

  peerConnection = null;
}

/* ---------------- BUTTONS ---------------- */

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

/* ---------------- INIT ---------------- */

async function initializeChat() {
  updateGuestCounter();

  /*
   * First request camera/mic.
   * But DO NOT call Connected here.
   */
  try {
    await requestCameraAndMic();

    setStatus(
      "Searching for someone..."
    );

    await connectSocket();

    /*
     * If socket was already connected before
     * this function reached here, start searching.
     */
    if (
      socket &&
      socket.connected
    ) {
      registerUser();
      startSearching();
    }

  } catch (error) {
    console.error(
      "Chat initialization error:",
      error
    );

    isSearching = false;

    setStatus(
      error.message ||
      "Camera and microphone permission is required."
    );
  }
}

/* ---------------- PUBLIC API ---------------- */

window.VizoChat = {
  startSearching,
  nextUser,
  endChat,
  toggleCamera,
  toggleMic,

  getState: () => ({
    searching: isSearching,
    connected: isConnected,
    matchId: currentMatchId,
    partnerId: currentPartnerId,
    socketConnected:
      Boolean(socket?.connected),
    peerConnectionState:
      peerConnection?.connectionState ||
      "not-created"
  })
};

document.addEventListener(
  "DOMContentLoaded",
  () => {
    initializeChat();
  }
);

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
        .forEach((track) => track.stop());
    }
  }
);
