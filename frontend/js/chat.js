"use strict";

const API_BASE =
  window.VizoAuth?.VIZOCHAT_API ||
  "http://localhost:5000/api";

let socket = null;
let peerConnection = null;

let currentMatchId = null;
let currentPartnerId = null;
let isSearching = false;
let isConnected = false;

let localStream = null;
let matchStartedAt = null;
let matchTimer = null;

const ICE_SERVERS = [
  {
    urls: "stun:stun.l.google.com:19302"
  }
];

const elements = {
  localVideo: document.getElementById("localVideo"),
  remoteVideo: document.getElementById("remoteVideo"),

  cameraButton: document.getElementById("cameraButton"),
  micButton: document.getElementById("micButton"),

  likeButton: document.getElementById("likeButton"),
  reportButton: document.getElementById("reportButton"),
  nextButton: document.getElementById("nextButton"),

  timer: document.getElementById("timer"),
  status: document.getElementById("status"),
  guestCounter: document.getElementById("guestCounter")
};

function getUserId() {
  if (window.VizoAuth) {
    return window.VizoAuth.getUserId();
  }

  let guestId = localStorage.getItem("vizochat_guest_id");

  if (!guestId) {
    guestId =
      "guest-" +
      Date.now() +
      "-" +
      Math.random().toString(36).substring(2, 10);

    localStorage.setItem(
      "vizochat_guest_id",
      guestId
    );
  }

  return guestId;
}

function isGuestUser() {
  return window.VizoAuth
    ? window.VizoAuth.isGuest()
    : true;
}

function setStatus(message) {
  if (elements.status) {
    elements.status.textContent = message;
  }
}

function updateGuestCounter() {
  if (!elements.guestCounter) {
    return;
  }

  if (!isGuestUser()) {
    elements.guestCounter.textContent = "";
    return;
  }

  const count =
    window.VizoAuth?.getGuestMatchCount() || 0;

  const remaining =
    window.VizoAuth?.getGuestMatchesRemaining() || 0;

  elements.guestCounter.textContent =
    `${count}/10 matches used • ${remaining} remaining`;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remainingSeconds).padStart(2, "0")
  );
}

function startTimer() {
  stopTimer();

  matchStartedAt = Date.now();

  matchTimer = setInterval(() => {
    if (!matchStartedAt) {
      return;
    }

    const seconds = Math.floor(
      (Date.now() - matchStartedAt) / 1000
    );

    if (elements.timer) {
      elements.timer.textContent =
        formatTime(seconds);
    }
  }, 1000);
}

function stopTimer() {
  if (matchTimer) {
    clearInterval(matchTimer);
    matchTimer = null;
  }

  matchStartedAt = null;

  if (elements.timer) {
    elements.timer.textContent = "00:00";
  }
}

async function loadSocketIO() {
  if (window.io) {
    return true;
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");

    script.src =
      "https://cdn.socket.io/4.8.1/socket.io.min.js";

    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);

    document.head.appendChild(script);
  });
}

async function connectSocket() {
  if (socket && socket.connected) {
    return true;
  }

  const loaded = await loadSocketIO();

  if (!loaded || !window.io) {
    setStatus(
      "Unable to load chat connection. Please refresh."
    );

    return false;
  }

  const socketURL =
    API_BASE.replace(/\/api\/?$/, "");

  socket = window.io(socketURL, {
    transports: ["websocket", "polling"]
  });

  socket.on("connect", () => {
    registerSocketUser();
  });

  socket.on("disconnect", () => {
    isConnected = false;

    if (!isSearching) {
      setStatus(
        "Connection lost. Please try again."
      );
    }
  });

  socket.on("connect_error", (error) => {
    console.error(
      "Socket connection error:",
      error
    );

    setStatus(
      "Unable to connect to VizoChat server."
    );
  });

  socket.on("match-found", async (match) => {
    await handleMatchFound(match);
  });

  socket.on("webrtc-offer", async (data) => {
    await handleWebRTCOffer(data);
  });

  socket.on("webrtc-answer", async (data) => {
    await handleWebRTCAnswer(data);
  });

  socket.on("webrtc-ice-candidate", async (data) => {
    await handleICECandidate(data);
  });

  socket.on("partner-disconnected", () => {
    handlePartnerDisconnected();
  });

  return new Promise((resolve) => {
    if (socket.connected) {
      resolve(true);
      return;
    }

    socket.once("connect", () => {
      resolve(true);
    });

    setTimeout(() => {
      resolve(Boolean(socket.connected));
    }, 5000);
  });
}

function registerSocketUser() {
  if (!socket || !socket.connected) {
    return;
  }

  socket.emit("register-user", {
    userId: getUserId(),
    isGuest: isGuestUser()
  });
}

async function getCameraAndMicrophone() {
  if (localStream) {
    return localStream;
  }

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error(
      "Camera and microphone are not supported."
    );
  }

  localStream =
    await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

  if (elements.localVideo) {
    elements.localVideo.srcObject =
      localStream;
  }

  return localStream;
}

async function startRandomChat() {
  if (isSearching || isConnected) {
    return;
  }

  if (
    isGuestUser() &&
    window.VizoAuth &&
    !window.VizoAuth.canGuestStartMatch()
  ) {
    setStatus(
      "Guest limit reached. Please login with Google to continue."
    );

    return;
  }

  try {
    isSearching = true;

    setStatus("Starting camera and microphone...");

    await getCameraAndMicrophone();

    setStatus("Connecting to VizoChat...");

    const connected =
      await connectSocket();

    if (!connected) {
      isSearching = false;
      return;
    }

    setStatus("Searching for someone new...");

    socket.emit("find-random-user", {
      userId: getUserId(),
      isGuest: isGuestUser()
    });
  } catch (error) {
    console.error(
      "Unable to start chat:",
      error
    );

    isSearching = false;

    setStatus(
      error.message ||
      "Camera/microphone permission is required."
    );
  }
}

async function handleMatchFound(match) {
  if (!match || !match.matchId) {
    return;
  }

  isSearching = false;
  isConnected = true;

  currentMatchId = match.matchId;

  if (match.userAId === getUserId()) {
    currentPartnerId = match.userBId;
  } else {
    currentPartnerId = match.userAId;
  }

  if (
    isGuestUser() &&
    window.VizoAuth
  ) {
    window.VizoAuth.incrementGuestMatchCount();
  }

  updateGuestCounter();

  setStatus("You are connected!");

  startTimer();

  await createPeerConnection();

  if (match.userAId === getUserId()) {
    await createAndSendOffer();
  }
}

async function createPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection =
    new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });

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

  peerConnection.onicecandidate = (event) => {
    if (
      event.candidate &&
      socket &&
      currentMatchId
    ) {
      socket.emit("webrtc-ice-candidate", {
        matchId: currentMatchId,
        candidate: event.candidate
      });
    }
  };

  peerConnection.ontrack = (event) => {
    if (
      elements.remoteVideo &&
      event.streams &&
      event.streams[0]
    ) {
      elements.remoteVideo.srcObject =
        event.streams[0];
    }
  };

  peerConnection.onconnectionstatechange =
    () => {
      if (!peerConnection) {
        return;
      }

      const state =
        peerConnection.connectionState;

      if (state === "connected") {
        isConnected = true;

        setStatus(
          "Connected — enjoy your chat!"
        );

        if (socket && currentMatchId) {
          socket.emit("webrtc-connected", {
            matchId: currentMatchId
          });
        }
      }

      if (
        state === "failed" ||
        state === "disconnected" ||
        state === "closed"
      ) {
        if (isConnected) {
          setStatus(
            "Connection ended."
          );
        }
      }
    };
}

async function createAndSendOffer() {
  if (!peerConnection || !socket) {
    return;
  }

  const offer =
    await peerConnection.createOffer();

  await peerConnection.setLocalDescription(
    offer
  );

  socket.emit("webrtc-offer", {
    matchId: currentMatchId,
    offer
  });
}

async function handleWebRTCOffer(data) {
  if (!data || !data.offer) {
    return;
  }

  if (!peerConnection) {
    await createPeerConnection();
  }

  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(data.offer)
  );

  const answer =
    await peerConnection.createAnswer();

  await peerConnection.setLocalDescription(
    answer
  );

  if (socket) {
    socket.emit("webrtc-answer", {
      matchId: currentMatchId,
      answer
    });
  }
}

async function handleWebRTCAnswer(data) {
  if (
    !data ||
    !data.answer ||
    !peerConnection
  ) {
    return;
  }

  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(data.answer)
  );
}

async function handleICECandidate(data) {
  if (
    !data ||
    !data.candidate ||
    !peerConnection
  ) {
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

function handlePartnerDisconnected() {
  isConnected = false;
  isSearching = false;

  stopTimer();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (elements.remoteVideo) {
    elements.remoteVideo.srcObject = null;
  }

  currentMatchId = null;
  currentPartnerId = null;

  setStatus(
    "The other person left the chat."
  );
}

async function nextUser() {
  if (!socket) {
    return;
  }

  const oldMatchId = currentMatchId;

  isConnected = false;
  isSearching = true;

  stopTimer();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (elements.remoteVideo) {
    elements.remoteVideo.srcObject = null;
  }

  currentMatchId = null;
  currentPartnerId = null;

  if (oldMatchId) {
    socket.emit("next-user", {
      matchId: oldMatchId
    });
  }

  setStatus("Searching for next person...");

  if (
    isGuestUser() &&
    window.VizoAuth &&
    !window.VizoAuth.canGuestStartMatch()
  ) {
    isSearching = false;

    setStatus(
      "Guest limit reached. Please login with Google."
    );

    return;
  }

  socket.emit("find-random-user", {
    userId: getUserId(),
    isGuest: isGuestUser()
  });
}

function endChat() {
  if (socket && currentMatchId) {
    socket.emit("end-chat", {
      matchId: currentMatchId
    });
  }

  isConnected = false;
  isSearching = false;

  stopTimer();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (elements.remoteVideo) {
    elements.remoteVideo.srcObject = null;
  }

  currentMatchId = null;
  currentPartnerId = null;

  setStatus("Chat ended.");
}

function toggleCamera() {
  if (!localStream) {
    return;
  }

  const videoTracks =
    localStream.getVideoTracks();

  videoTracks.forEach((track) => {
    track.enabled = !track.enabled;
  });

  const enabled =
    videoTracks.some(
      (track) => track.enabled
    );

  if (elements.cameraButton) {
    elements.cameraButton.textContent =
      enabled
        ? "Camera"
        : "Camera Off";
  }
}

function toggleMicrophone() {
  if (!localStream) {
    return;
  }

  const audioTracks =
    localStream.getAudioTracks();

  audioTracks.forEach((track) => {
    track.enabled = !track.enabled;
  });

  const enabled =
    audioTracks.some(
      (track) => track.enabled
    );

  if (elements.micButton) {
    elements.micButton.textContent =
      enabled
        ? "Mic"
        : "Mic Off";
  }
}

async function sendReport() {
  if (!currentPartnerId) {
    return;
  }

  const reason =
    window.prompt(
      "Report reason:",
      "Inappropriate behavior"
    );

  if (reason === null) {
    return;
  }

  try {
    const response =
      await fetch(
        `${API_BASE}/reports`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            reporterId: getUserId(),
            reportedUserId:
              currentPartnerId,
            matchId:
              currentMatchId,
            reason:
              reason.trim() || "Other"
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to submit report."
      );
    }

    if (data.banned) {
      setStatus(
        "This user has been banned for 23 days."
      );
    } else {
      setStatus(
        "Report submitted successfully."
      );
    }
  } catch (error) {
    console.error(
      "Report error:",
      error
    );

    setStatus(
      error.message ||
      "Unable to submit report."
    );
  }
}

function setupButtons() {
  if (elements.cameraButton) {
    elements.cameraButton.addEventListener(
      "click",
      toggleCamera
    );
  }

  if (elements.micButton) {
    elements.micButton.addEventListener(
      "click",
      toggleMicrophone
    );
  }

  if (elements.nextButton) {
    elements.nextButton.addEventListener(
      "click",
      nextUser
    );
  }

  if (elements.reportButton) {
    elements.reportButton.addEventListener(
      "click",
      sendReport
    );
  }
}

async function initializeChat() {
  updateGuestCounter();
  setupButtons();

  setStatus(
    "Ready to find someone new."
  );

  try {
    await getCameraAndMicrophone();

    setStatus(
      "Camera ready. Finding someone..."
    );

    await startRandomChat();
  } catch (error) {
    console.error(
      "Chat initialization error:",
      error
    );

    setStatus(
      "Allow camera and microphone access to start."
    );
  }
}

window.VizoChat = {
  startRandomChat,
  nextUser,
  endChat,
  toggleCamera,
  toggleMicrophone,
  sendReport,
  getCurrentMatchId: () =>
    currentMatchId,
  getCurrentPartnerId: () =>
    currentPartnerId
};

document.addEventListener(
  "DOMContentLoaded",
  initializeChat
);
