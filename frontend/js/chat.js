"use strict";

/* =========================================
   VizoChat Chat System
========================================= */

const CHAT_API =
  window.VizoAuth?.VIZOCHAT_API ||
  "https://website-r746.onrender.com/api";

const SOCKET_IO_URL = "https://cdn.socket.io/4.8.1/socket.io.min.js";

let socket = null;
let localStream = null;
let peerConnection = null;

let currentMatchId = null;
let currentPartnerId = null;

let cameraEnabled = true;
let microphoneEnabled = true;
let chatStarted = false;

let timerInterval = null;
let chatStartTime = null;

let socketLoaded = false;


/* =========================================
   DOM
========================================= */

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const statusElement = document.getElementById("status");
const timerElement = document.getElementById("timer");
const guestCounter = document.getElementById("guestCounter");

const cameraButton = document.getElementById("cameraButton");
const micButton = document.getElementById("micButton");
const nextButton = document.getElementById("nextButton");
const reportButton = document.getElementById("reportButton");


/* =========================================
   STATUS
========================================= */

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }
}


/* =========================================
   GUEST COUNTER
========================================= */

function updateGuestCounter() {
  if (!guestCounter || !window.VizoAuth) return;

  if (window.VizoAuth.isGuest()) {
    const used = window.VizoAuth.getGuestMatchCount();

    guestCounter.textContent =
      `${used}/10 matches used`;
  } else {
    guestCounter.textContent =
      "Google account";
  }
}


/* =========================================
   LOAD SOCKET.IO
========================================= */

function loadSocketIO() {
  return new Promise((resolve, reject) => {
    if (window.io) {
      socketLoaded = true;
      resolve();
      return;
    }

    const existingScript =
      document.querySelector(
        'script[data-vizochat-socketio="true"]'
      );

    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => {
          socketLoaded = true;
          resolve();
        }
      );

      existingScript.addEventListener(
        "error",
        reject
      );

      return;
    }

    const script = document.createElement("script");

    script.src = SOCKET_IO_URL;
    script.async = true;
    script.dataset.vizochatSocketio = "true";

    script.onload = () => {
      if (window.io) {
        socketLoaded = true;
        resolve();
      } else {
        reject(
          new Error("Socket.IO failed to load.")
        );
      }
    };

    script.onerror = () => {
      reject(
        new Error("Unable to load Socket.IO.")
      );
    };

    document.head.appendChild(script);
  });
}


/* =========================================
   CAMERA + MICROPHONE
========================================= */

async function startLocalMedia() {
  try {
    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    cameraEnabled = true;
    microphoneEnabled = true;

    updateMediaButtons();

    return true;
  } catch (error) {
    console.error(
      "Camera/microphone error:",
      error
    );

    setStatus(
      "Camera and microphone permission is required."
    );

    return false;
  }
}


/* =========================================
   SOCKET CONNECTION
========================================= */

async function connectSocket() {
  try {
    await loadSocketIO();

    if (socket && socket.connected) {
      return true;
    }

    socket = window.io(
      CHAT_API.replace("/api", ""),
      {
        transports: ["websocket", "polling"],
        reconnection: true
      }
    );

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 10000);

      socket.once("connect", () => {
        clearTimeout(timeout);

        console.log(
          "Connected to VizoChat:",
          socket.id
        );

        registerSocketUser();

        resolve(true);
      });

      socket.once("connect_error", (error) => {
        clearTimeout(timeout);

        console.error(
          "Socket connection error:",
          error
        );

        resolve(false);
      });

      setupSocketEvents();
    });

  } catch (error) {
    console.error(
      "Socket initialization error:",
      error
    );

    setStatus(
      "Unable to connect to VizoChat server."
    );

    return false;
  }
}


/* =========================================
   REGISTER USER
========================================= */

function registerSocketUser() {
  if (!socket) return;

  const userId =
    window.VizoAuth?.getUserId();

  const isGuest =
    window.VizoAuth?.isGuest();

  socket.emit(
    "register-user",
    {
      userId,
      isGuest
    }
  );
}


/* =========================================
   SOCKET EVENTS
========================================= */

function setupSocketEvents() {
  if (!socket) return;

  socket.on(
    "match-found",
    async (data) => {
      await handleMatchFound(data);
    }
  );

  socket.on(
    "partner-disconnected",
    () => {
      handlePartnerDisconnected();
    }
  );

  socket.on(
    "offer",
    async (data) => {
      await handleOffer(data);
    }
  );

  socket.on(
    "answer",
    async (data) => {
      await handleAnswer(data);
    }
  );

  socket.on(
    "ice-candidate",
    async (data) => {
      await handleIceCandidate(data);
    }
  );

  socket.on(
    "connect_error",
    (error) => {
      console.error(
        "Socket error:",
        error
      );

      setStatus(
        "Connection problem. Please try again."
      );
    }
  );

  socket.on(
    "disconnect",
    () => {
      if (chatStarted) {
        setStatus(
          "Disconnected from server."
        );
      }
    }
  );
}


/* =========================================
   FIND RANDOM USER
========================================= */

async function startRandomChat() {
  if (chatStarted) return;

  updateGuestCounter();

  if (
    window.VizoAuth?.isGuest() &&
    !window.VizoAuth.canGuestStartMatch()
  ) {
    setStatus(
      "Your 10 guest matches are finished. Please login with Google."
    );

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);

    return;
  }

  setStatus("Starting camera and microphone...");

  const mediaStarted =
    await startLocalMedia();

  if (!mediaStarted) return;

  setStatus("Connecting to VizoChat...");

  const connected =
    await connectSocket();

  if (!connected) {
    setStatus(
      "Unable to connect to VizoChat server."
    );
    return;
  }

  chatStarted = true;

  setStatus(
    "Finding someone new..."
  );

  socket.emit(
    "find-random-user"
  );
}


/* =========================================
   MATCH FOUND
========================================= */

async function handleMatchFound(data) {
  if (!data) return;

  currentMatchId =
    data.matchId ||
    data.id ||
    null;

  currentPartnerId =
    data.partnerId ||
    data.userId ||
    data.strangerId ||
    null;

  /* Guest match count */
  if (
    window.VizoAuth?.isGuest()
  ) {
    window.VizoAuth.incrementGuestMatchCount();
    updateGuestCounter();
  }

  setStatus(
    "Connected! You are now chatting with someone new."
  );

  startTimer();

  await createPeerConnection();

  /*
    Server can tell which user creates
    the initial WebRTC offer.
  */
  if (
    data.initiator === true ||
    data.isInitiator === true
  ) {
    await createAndSendOffer();
  }

  if (socket) {
    socket.emit(
      "webrtc-connected",
      {
        matchId: currentMatchId,
        userId:
          window.VizoAuth?.getUserId()
      }
    );
  }
}


/* =========================================
   WEBRTC CONFIG
========================================= */

function getIceServers() {
  return [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    }
  ];
}


/* =========================================
   CREATE PEER CONNECTION
========================================= */

async function createPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection =
    new RTCPeerConnection({
      iceServers: getIceServers()
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

  peerConnection.ontrack =
    (event) => {
      if (
        remoteVideo &&
        event.streams &&
        event.streams[0]
      ) {
        remoteVideo.srcObject =
          event.streams[0];

        remoteVideo.play().catch(
          () => {}
        );
      }
    };

  peerConnection.onicecandidate =
    (event) => {
      if (
        event.candidate &&
        socket &&
        currentMatchId
      ) {
        socket.emit(
          "ice-candidate",
          {
            matchId: currentMatchId,
            candidate: event.candidate
          }
        );
      }
    };

  peerConnection.onconnectionstatechange =
    () => {
      if (!peerConnection) return;

      const state =
        peerConnection.connectionState;

      console.log(
        "WebRTC state:",
        state
      );

      if (state === "connected") {
        setStatus(
          "Video chat connected."
        );
      }

      if (
        state === "failed" ||
        state === "disconnected"
      ) {
        setStatus(
          "Video connection interrupted."
        );
      }
    };
}


/* =========================================
   CREATE OFFER
========================================= */

async function createAndSendOffer() {
  if (!peerConnection || !socket) {
    return;
  }

  try {
    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    socket.emit(
      "offer",
      {
        matchId: currentMatchId,
        offer
      }
    );

  } catch (error) {
    console.error(
      "Offer error:",
      error
    );
  }
}


/* =========================================
   RECEIVE OFFER
========================================= */

async function handleOffer(data) {
  if (!data || !data.offer) return;

  try {
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
      socket.emit(
        "answer",
        {
          matchId:
            data.matchId ||
            currentMatchId,
          answer
        }
      );
    }

  } catch (error) {
    console.error(
      "Offer handling error:",
      error
    );
  }
}


/* =========================================
   RECEIVE ANSWER
========================================= */

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
  } catch (error) {
    console.error(
      "Answer error:",
      error
    );
  }
}


/* =========================================
   ICE CANDIDATE
========================================= */

async function handleIceCandidate(data) {
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


/* =========================================
   TIMER
========================================= */

function startTimer() {
  stopTimer();

  chatStartTime = Date.now();

  timerInterval =
    setInterval(() => {
      if (!timerElement) return;

      const seconds = Math.floor(
        (Date.now() - chatStartTime) /
        1000
      );

      const minutes =
        Math.floor(seconds / 60);

      const remainingSeconds =
        seconds % 60;

      timerElement.textContent =
        `${String(minutes).padStart(2, "0")}:` +
        `${String(remainingSeconds).padStart(2, "0")}`;
    }, 1000);
}


function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (timerElement) {
    timerElement.textContent =
      "00:00";
  }
}


/* =========================================
   CAMERA
========================================= */

function toggleCamera() {
  if (!localStream) return;

  const videoTracks =
    localStream.getVideoTracks();

  if (!videoTracks.length) return;

  cameraEnabled =
    !cameraEnabled;

  videoTracks.forEach(
    (track) => {
      track.enabled =
        cameraEnabled;
    }
  );

  updateMediaButtons();
}


/* =========================================
   MICROPHONE
========================================= */

function toggleMicrophone() {
  if (!localStream) return;

  const audioTracks =
    localStream.getAudioTracks();

  if (!audioTracks.length) return;

  microphoneEnabled =
    !microphoneEnabled;

  audioTracks.forEach(
    (track) => {
      track.enabled =
        microphoneEnabled;
    }
  );

  updateMediaButtons();
}


/* =========================================
   BUTTON TEXT
========================================= */

function updateMediaButtons() {
  if (cameraButton) {
    cameraButton.textContent =
      cameraEnabled
        ? "Camera"
        : "Camera Off";
  }

  if (micButton) {
    micButton.textContent =
      microphoneEnabled
        ? "Mic"
        : "Mic Off";
  }
}


/* =========================================
   NEXT USER
========================================= */

function nextUser() {
  if (!socket) {
    startRandomChat();
    return;
  }

  stopCurrentPeer();

  setStatus(
    "Finding another person..."
  );

  currentMatchId = null;
  currentPartnerId = null;

  if (socket.connected) {
    socket.emit(
      "next-user"
    );
  }

  updateGuestCounter();
}


/* =========================================
   END CHAT
========================================= */

function endChat() {
  if (socket && socket.connected) {
    socket.emit(
      "end-chat",
      {
        matchId: currentMatchId
      }
    );
  }

  stopCurrentPeer();

  chatStarted = false;

  currentMatchId = null;
  currentPartnerId = null;

  setStatus(
    "Chat ended. Ready to find someone new."
  );
}


/* =========================================
   STOP PEER
========================================= */

function stopCurrentPeer() {
  stopTimer();

  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.close();
    peerConnection = null;
  }

  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
}


/* =========================================
   PARTNER DISCONNECTED
========================================= */

function handlePartnerDisconnected() {
  stopCurrentPeer();

  currentMatchId = null;
  currentPartnerId = null;

  setStatus(
    "The other person left the chat."
  );
}


/* =========================================
   REPORT USER
========================================= */

async function sendReport() {
  if (!currentPartnerId) {
    alert(
      "There is no active person to report."
    );
    return;
  }

  const reason =
    window.prompt(
      "Why do you want to report this user?"
    );

  if (!reason || !reason.trim()) {
    return;
  }

  try {
    const response =
      await fetch(
        `${CHAT_API}/reports`,
        {
          method: "POST",
          headers:
            window.VizoAuth?.getAuthHeaders
              ? window.VizoAuth.getAuthHeaders()
              : {
                  "Content-Type":
                    "application/json"
                },
          body: JSON.stringify({
            reporterId:
              window.VizoAuth?.getUserId(),
            reportedUserId:
              currentPartnerId,
            matchId:
              currentMatchId,
            reason:
              reason.trim()
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message ||
        "Unable to send report."
      );
    }

    alert(
      "Report submitted successfully."
    );

  } catch (error) {
    console.error(
      "Report error:",
      error
    );

    alert(
      error.message ||
      "Unable to send report."
    );
  }
}


/* =========================================
   BUTTON EVENTS
========================================= */

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

if (nextButton) {
  nextButton.addEventListener(
    "click",
    nextUser
  );
}

if (reportButton) {
  reportButton.addEventListener(
    "click",
    sendReport
  );
}


/* =========================================
   PAGE START
========================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    updateGuestCounter();

    /*
      Chat automatically starts when
      chat.html is opened.
    */
    startRandomChat();
  }
);


/* =========================================
   GLOBAL VIZO CHAT
========================================= */

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
