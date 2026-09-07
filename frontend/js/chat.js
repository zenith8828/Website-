"use strict";

/* =========================================================
   VIZOCHAT - RANDOM VIDEO CHAT
   ========================================================= */

const VIZO_API = "https://website-r746.onrender.com/api";
const VIZO_SOCKET = "https://website-r746.onrender.com";

const GUEST_LIMIT = 10;

let socket = null;
let localStream = null;
let peerConnection = null;

let currentMatchId = null;
let currentPartnerId = null;

let socketRegistered = false;
let searching = false;
let connected = false;

let matchStartedAt = null;
let timerInterval = null;

let pendingIceCandidates = [];


/* =========================================================
   ELEMENT HELPER
========================================================= */

function $(id) {
  return document.getElementById(id);
}


/* =========================================================
   STATUS
========================================================= */

function setStatus(message) {
  const box = $("status");

  if (box) {
    box.textContent = message;
  }

  console.log("[VizoChat]", message);
}


/* =========================================================
   USER
========================================================= */

function getUserId() {

  if (
    window.VizoAuth &&
    typeof window.VizoAuth.getUserId === "function"
  ) {
    return window.VizoAuth.getUserId();
  }

  let id = localStorage.getItem("vizochat_guest_id");

  if (!id) {

    id =
      "guest_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .substring(2, 10);

    localStorage.setItem(
      "vizochat_guest_id",
      id
    );
  }

  return id;
}


function getUserType() {

  if (
    window.VizoAuth &&
    typeof window.VizoAuth.isLoggedIn === "function" &&
    window.VizoAuth.isLoggedIn()
  ) {
    return "user";
  }

  return "guest";
}


/* =========================================================
   GUEST MATCH COUNT
========================================================= */

function getGuestMatches() {

  return parseInt(
    localStorage.getItem(
      "vizochat_guest_matches"
    ) || "0",
    10
  );
}


function updateGuestCounter() {

  const box = $("guestCounter");

  if (!box) {
    return;
  }

  const count = getGuestMatches();

  box.textContent =
    "Guest Matches: " +
    count +
    "/" +
    GUEST_LIMIT;
}


function increaseGuestMatch() {

  if (getUserType() !== "guest") {
    return;
  }

  const count =
    getGuestMatches() + 1;

  localStorage.setItem(
    "vizochat_guest_matches",
    String(count)
  );

  updateGuestCounter();
}


/* =========================================================
   CAMERA + MICROPHONE
========================================================= */

async function requestCameraAndMic() {

  setStatus(
    "Requesting camera and microphone permission..."
  );

  if (!window.isSecureContext) {

    setStatus(
      "Camera/Mic requires HTTPS."
    );

    return false;
  }

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    setStatus(
      "Your browser does not support camera/microphone."
    );

    return false;
  }

  try {

    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

    const video =
      $("localVideo");

    if (video) {

      video.srcObject =
        localStream;

      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;

      try {
        await video.play();
      } catch (error) {
        console.log(
          "Local video play:",
          error
        );
      }
    }

    const placeholder =
      $("localPlaceholder");

    if (placeholder) {

      placeholder.classList.add(
        "hidden"
      );
    }

    updateCameraButton();
    updateMicButton();

    setStatus(
      "Camera and microphone ready. Connecting..."
    );

    return true;

  } catch (error) {

    console.error(
      "Camera/Mic error:",
      error
    );

    if (
      error.name ===
      "NotAllowedError"
    ) {

      setStatus(
        "Camera/Mic permission denied. Browser settings me Camera aur Microphone Allow karo."
      );

    } else if (
      error.name ===
      "NotFoundError"
    ) {

      setStatus(
        "Camera ya microphone device nahi mila."
      );

    } else if (
      error.name ===
      "NotReadableError"
    ) {

      setStatus(
        "Camera/Mic kisi aur app me use ho raha hai."
      );

    } else {

      setStatus(
        "Camera/Mic error: " +
        error.message
      );
    }

    return false;
  }
}


/* =========================================================
   CAMERA BUTTON UI
========================================================= */

function updateCameraButton() {

  const btn =
    $("cameraBtn");

  if (!btn) {
    return;
  }

  if (!localStream) {

    btn.textContent = "📷";

    btn.setAttribute(
      "aria-label",
      "Camera"
    );

    btn.setAttribute(
      "title",
      "Camera"
    );

    return;
  }

  const tracks =
    localStream.getVideoTracks();

  if (!tracks.length) {

    btn.textContent = "📷";

    return;
  }

  const enabled =
    tracks[0].enabled;

  btn.textContent =
    enabled
      ? "📷"
      : "🚫📷";

  btn.setAttribute(
    "aria-label",
    enabled
      ? "Camera On"
      : "Camera Off"
  );

  btn.setAttribute(
    "title",
    enabled
      ? "Camera On"
      : "Camera Off"
  );
}


/* =========================================================
   MICROPHONE BUTTON UI
========================================================= */

function updateMicButton() {

  const btn =
    $("micBtn");

  if (!btn) {
    return;
  }

  if (!localStream) {

    btn.textContent = "🎤";

    return;
  }

  const tracks =
    localStream.getAudioTracks();

  if (!tracks.length) {

    btn.textContent = "🎤";

    return;
  }

  const enabled =
    tracks[0].enabled;

  btn.textContent =
    enabled
      ? "🎤"
      : "🔇";

  btn.setAttribute(
    "aria-label",
    enabled
      ? "Microphone On"
      : "Microphone Off"
  );

  btn.setAttribute(
    "title",
    enabled
      ? "Microphone On"
      : "Microphone Off"
  );
}


/* =========================================================
   SOCKET CONNECTION
========================================================= */

function connectSocket() {

  return new Promise(
    function(resolve, reject) {

      if (
        socket &&
        socket.connected
      ) {

        registerUser();

        resolve(socket);

        return;
      }

      if (!window.io) {

        setStatus(
          "Socket.IO load nahi hua. Please reload."
        );

        reject(
          new Error(
            "Socket.IO unavailable"
          )
        );

        return;
      }

      socket =
        window.io(
          VIZO_SOCKET,
          {
            transports: [
              "websocket",
              "polling"
            ],

            reconnection: true
          }
        );

      socket.on(
        "connect",
        function() {

          console.log(
            "Socket connected:",
            socket.id
          );

          socketRegistered = false;

          registerUser();

          resolve(socket);
        }
      );

      socket.on(
        "connect_error",
        function(error) {

          console.error(
            "Socket connection error:",
            error
          );

          setStatus(
            "VizoChat server se connection nahi ho raha."
          );

          reject(error);
        }
      );

      socket.on(
        "disconnect",
        function(reason) {

          console.log(
            "Socket disconnected:",
            reason
          );

          socketRegistered = false;

          if (!connected) {

            setStatus(
              "Server connection lost. Reconnecting..."
            );
          }
        }
      );

      socket.on(
        "match-found",
        handleMatchFound
      );

      socket.on(
        "webrtc-offer",
        handleWebRTCOffer
      );

      socket.on(
        "webrtc-answer",
        handleWebRTCAnswer
      );

      socket.on(
        "webrtc-ice-candidate",
        handleRemoteIceCandidate
      );

      socket.on(
        "webrtc-connected",
        function() {

          console.log(
            "Partner WebRTC connected"
          );
        }
      );

      socket.on(
        "partner-disconnected",
        function() {

          console.log(
            "Partner disconnected"
          );

          setStatus(
            "Person disconnected. Finding someone..."
          );

          currentMatchId = null;
          currentPartnerId = null;

          cleanupPeer();

          setTimeout(
            function() {

              if (!searching) {
                startSearching();
              }

            },
            500
          );
        }
      );

      socket.on(
        "ready-for-next-user",
        function() {

          console.log(
            "Ready for next user"
          );
        }
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
    getUserId();

  const userType =
    getUserType();

  socket.emit(
    "register-user",
    {
      userId: userId,

      userType: userType,

      isGuest:
        userType === "guest"
    }
  );

  socketRegistered = true;

  console.log(
    "Registered:",
    userId,
    userType
  );
}


/* =========================================================
   PEER CONNECTION
========================================================= */

function createPeerConnection() {

  if (peerConnection) {

    try {
      peerConnection.close();
    } catch (error) {}

  }

  pendingIceCandidates = [];

  peerConnection =
    new RTCPeerConnection({

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
    });

  if (localStream) {

    localStream
      .getTracks()
      .forEach(
        function(track) {

          peerConnection.addTrack(
            track,
            localStream
          );

        }
      );
  }

  peerConnection.ontrack =
    function(event) {

      console.log(
        "Remote track received"
      );

      const video =
        $("remoteVideo");

      if (!video) {
        return;
      }

      if (
        event.streams &&
        event.streams[0]
      ) {

        video.srcObject =
          event.streams[0];

      } else {

        let stream =
          video.srcObject;

        if (!stream) {

          stream =
            new MediaStream();

          video.srcObject =
            stream;
        }

        stream.addTrack(
          event.track
        );
      }

      video.muted = false;
      video.autoplay = true;
      video.playsInline = true;

      video.play()
        .catch(
          function(error) {

            console.log(
              "Remote video play:",
              error
            );
          }
        );

      const placeholder =
        $("remotePlaceholder");

      if (placeholder) {

        placeholder.classList.add(
          "hidden"
        );
      }
    };

  peerConnection.onicecandidate =
    function(event) {

      if (
        event.candidate &&
        socket &&
        socket.connected
      ) {

        socket.emit(
          "webrtc-ice-candidate",
          {
            matchId:
              currentMatchId,

            candidate:
              event.candidate
          }
        );
      }
    };

  peerConnection.onconnectionstatechange =
    function() {

      if (!peerConnection) {
        return;
      }

      const state =
        peerConnection.connectionState;

      console.log(
        "WebRTC state:",
        state
      );

      if (
        state === "connected"
      ) {

        handleWebRTCConnected();

      } else if (
        state === "failed"
      ) {

        setStatus(
          "Video connection failed. Press Next and try again."
        );

      } else if (
        state === "disconnected"
      ) {

        setStatus(
          "Video connection interrupted..."
        );
      }
    };

  return peerConnection;
}


/* =========================================================
   MATCH FOUND
========================================================= */

async function handleMatchFound(data) {

  console.log(
    "MATCH FOUND:",
    data
  );

  searching = false;

  currentMatchId =
    data.matchId ||
    data.id ||
    null;

  currentPartnerId =
    data.partnerId ||
    data.userId ||
    data.remoteUserId ||
    null;

  setStatus(
    "Match found. Connecting video..."
  );

  const remotePlaceholder =
    $("remotePlaceholder");

  if (remotePlaceholder) {

    remotePlaceholder.textContent =
      "Connecting...";

    remotePlaceholder.classList.remove(
      "hidden"
    );
  }

  createPeerConnection();

  const initiator =
    data.initiator === true ||
    data.isInitiator === true;

  if (initiator) {

    try {

      const offer =
        await peerConnection.createOffer();

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

    } catch (error) {

      console.error(
        "Offer error:",
        error
      );

      setStatus(
        "Video connection start nahi ho saka."
      );
    }
  }
}


/* =========================================================
   WEBRTC OFFER
========================================================= */

async function handleWebRTCOffer(data) {

  if (!peerConnection) {

    createPeerConnection();
  }

  try {

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        data.offer
      )
    );

    await processPendingIceCandidates();

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

        answer:
          peerConnection.localDescription
      }
    );

  } catch (error) {

    console.error(
      "Offer handling error:",
      error
    );

    setStatus(
      "Video connection error."
    );
  }
}


/* =========================================================
   WEBRTC ANSWER
========================================================= */

async function handleWebRTCAnswer(data) {

  if (!peerConnection) {
    return;
  }

  try {

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        data.answer
      )
    );

    await processPendingIceCandidates();

  } catch (error) {

    console.error(
      "Answer error:",
      error
    );
  }
}


/* =========================================================
   ICE CANDIDATE
========================================================= */

async function handleRemoteIceCandidate(data) {

  if (!data.candidate) {
    return;
  }

  if (
    !peerConnection ||
    !peerConnection.remoteDescription
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
      "ICE error:",
      error
    );
  }
}


/* =========================================================
   PROCESS ICE QUEUE
========================================================= */

async function processPendingIceCandidates() {

  if (!peerConnection) {
    return;
  }

  const list =
    pendingIceCandidates;

  pendingIceCandidates = [];

  for (
    const candidate of list
  ) {

    try {

      await peerConnection.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      );

    } catch (error) {

      console.error(
        "Pending ICE error:",
        error
      );
    }
  }
}


/* =========================================================
   WEBRTC CONNECTED
========================================================= */

function handleWebRTCConnected() {

  if (connected) {
    return;
  }

  connected = true;
  searching = false;

  increaseGuestMatch();

  setStatus(
    "Connected! You are now chatting with someone new."
  );

  startTimer();

  const likeBtn =
    $("likeBtn");

  const reportBtn =
    $("reportBtn");

  if (likeBtn) {
    likeBtn.disabled = false;
  }

  if (reportBtn) {
    reportBtn.disabled = false;
  }

  if (
    socket &&
    socket.connected
  ) {

    socket.emit(
      "webrtc-connected",
      {
        matchId:
          currentMatchId
      }
    );
  }

  /*
   * Reset Like state for the new match.
   * like.js handles this function if available.
   */

  if (
    window.VizoLike &&
    typeof window.VizoLike.resetLikeForNewMatch === "function"
  ) {

    try {
      window.VizoLike.resetLikeForNewMatch();
    } catch (error) {
      console.error(
        "Like reset error:",
        error
      );
    }
  }

  if (
    typeof window.resetLikeForNewMatch === "function"
  ) {

    try {
      window.resetLikeForNewMatch();
    } catch (error) {
      console.error(
        "Like reset error:",
        error
      );
    }
  }
}


/* =========================================================
   TIMER
========================================================= */

function startTimer() {

  stopTimer();

  matchStartedAt =
    Date.now();

  updateTimer();

  timerInterval =
    setInterval(
      updateTimer,
      1000
    );
}


function updateTimer() {

  const timer =
    $("timer");

  if (
    !timer ||
    !matchStartedAt
  ) {
    return;
  }

  const seconds =
    Math.floor(
      (Date.now() -
        matchStartedAt) /
      1000
    );

  const minutes =
    Math.floor(
      seconds / 60
    );

  const secs =
    seconds % 60;

  timer.textContent =
    "Match Time: " +
    String(minutes)
      .padStart(2, "0") +
    ":" +
    String(secs)
      .padStart(2, "0");
}


function stopTimer() {

  if (timerInterval) {

    clearInterval(
      timerInterval
    );

    timerInterval = null;
  }

  matchStartedAt = null;
}


/* =========================================================
   CLEAN PEER
========================================================= */

function cleanupPeer() {

  connected = false;

  stopTimer();

  pendingIceCandidates = [];

  if (peerConnection) {

    try {
      peerConnection.close();
    } catch (error) {}

    peerConnection = null;
  }

  const remoteVideo =
    $("remoteVideo");

  if (remoteVideo) {

    remoteVideo.srcObject =
      null;
  }

  const placeholder =
    $("remotePlaceholder");

  if (placeholder) {

    placeholder.textContent =
      "Looking for someone...";

    placeholder.classList.remove(
      "hidden"
    );
  }

  const likeBtn =
    $("likeBtn");

  const reportBtn =
    $("reportBtn");

  if (likeBtn) {
    likeBtn.disabled = true;
  }

  if (reportBtn) {
    reportBtn.disabled = true;
  }

  if (
    typeof window.resetLikeForNewMatch === "function"
  ) {

    try {
      window.resetLikeForNewMatch();
    } catch (error) {
      console.error(
        "Like cleanup error:",
        error
      );
    }
  }
}


/* =========================================================
   START SEARCH
========================================================= */

async function startSearching() {

  if (searching) {
    return;
  }

  if (
    getUserType() === "guest" &&
    getGuestMatches() >=
      GUEST_LIMIT
  ) {

    setStatus(
      "Guest limit reached. Please login with Google to continue."
    );

    return;
  }

  cleanupPeer();

  searching = true;

  setStatus(
    "Connecting to VizoChat server..."
  );

  try {

    await connectSocket();

    if (
      !socket ||
      !socket.connected
    ) {

      throw new Error(
        "Socket not connected"
      );
    }

    registerUser();

    setStatus(
      "Looking for someone..."
    );

    socket.emit(
      "find-random-user",
      {
        userId:
          getUserId(),

        userType:
          getUserType(),

        isGuest:
          getUserType() ===
          "guest"
      }
    );

  } catch (error) {

    console.error(
      "Search error:",
      error
    );

    searching = false;

    setStatus(
      "Server se connect nahi ho saka. Please try again."
    );
  }
}


/* =========================================================
   NEXT USER / CUT
========================================================= */

async function nextUser() {

  if (
    socket &&
    socket.connected
  ) {

    socket.emit(
      "next-user",
      {
        matchId:
          currentMatchId
      }
    );
  }

  currentMatchId = null;
  currentPartnerId = null;

  cleanupPeer();

  setStatus(
    "Looking for someone..."
  );

  await startSearching();
}


/* =========================================================
   END CHAT
========================================================= */

function endChat() {

  if (
    socket &&
    socket.connected
  ) {

    socket.emit(
      "end-chat",
      {
        matchId:
          currentMatchId
      }
    );
  }

  currentMatchId = null;
  currentPartnerId = null;

  cleanupPeer();
}


/* =========================================================
   CAMERA BUTTON
========================================================= */

function toggleCamera() {

  if (!localStream) {
    return;
  }

  const tracks =
    localStream.getVideoTracks();

  if (!tracks.length) {
    return;
  }

  const enabled =
    !tracks[0].enabled;

  tracks.forEach(
    function(track) {

      track.enabled =
        enabled;
    }
  );

  updateCameraButton();
}


/* =========================================================
   MICROPHONE BUTTON
========================================================= */

function toggleMic() {

  if (!localStream) {
    return;
  }

  const tracks =
    localStream.getAudioTracks();

  if (!tracks.length) {
    return;
  }

  const enabled =
    !tracks[0].enabled;

  tracks.forEach(
    function(track) {

      track.enabled =
        enabled;
    }
  );

  updateMicButton();
}


/* =========================================================
   CHAT BUTTON
========================================================= */

function openChat() {

  /*
   * Chat system UI can be connected later.
   * For now the button responds safely.
   */

  setStatus(
    "Chat feature is ready."
  );

  console.log(
    "Chat button clicked"
  );
}


/* =========================================================
   COIN BUTTON
========================================================= */

function openCoins() {

  console.log(
    "Coin button clicked"
  );

  /*
   * Future Coin Buy / Withdrawal page.
   */

  window.location.href =
    "./profile.html";
}


/* =========================================================
   REPORT USER
========================================================= */

async function reportUser() {

  if (
    !currentPartnerId ||
    !currentMatchId
  ) {

    setStatus(
      "Report karne ke liye pehle kisi se connect hona zaroori hai."
    );

    return;
  }

  const reason =
    window.prompt(
      "Report reason likho:"
    );

  if (
    reason === null
  ) {
    return;
  }

  const cleanReason =
    reason.trim();

  if (!cleanReason) {

    setStatus(
      "Report reason required hai."
    );

    return;
  }

  const reportBtn =
    $("reportBtn");

  if (reportBtn) {
    reportBtn.disabled = true;
  }

  setStatus(
    "Report submit ho raha hai..."
  );

  try {

    const response =
      await fetch(
        VIZO_API + "/reports",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            reporterId:
              getUserId(),

            reportedUserId:
              currentPartnerId,

            matchId:
              currentMatchId,

            reason:
              cleanReason
          })
        }
      );

    let data = null;

    try {
      data =
        await response.json();
    } catch (error) {}

    if (!response.ok) {

      throw new Error(
        data &&
        (
          data.message ||
          data.error
        )
          ? (
              data.message ||
              data.error
            )
          : "Report submit nahi hua."
      );
    }

    setStatus(
      "Report successfully submit ho gaya."
    );

    console.log(
      "Report submitted:",
      data
    );

  } catch (error) {

    console.error(
      "Report error:",
      error
    );

    setStatus(
      "Report submit nahi ho saka."
    );

  } finally {

    if (reportBtn) {
      reportBtn.disabled = false;
    }
  }
}


/* =========================================================
   LIKE BUTTON
========================================================= */

function setupLikeButton() {

  const likeBtn =
    $("likeBtn");

  if (!likeBtn) {
    return;
  }

  /*
   * like.js is responsible for the actual Like API.
   * This file does not duplicate Like logic.
   */

  likeBtn.addEventListener(
    "click",
    function() {

      console.log(
        "Like button clicked"
      );

      if (
        typeof window.sendLike ===
        "function"
      ) {

        window.sendLike();

        return;
      }

      if (
        window.VizoLike &&
        typeof window.VizoLike.sendLike ===
        "function"
      ) {

        window.VizoLike.sendLike();

        return;
      }

      console.error(
        "like.js sendLike function not found."
      );

      setStatus(
        "Like system load nahi hua. Please reload."
      );
    }
  );
}


/* =========================================================
   BUTTON EVENTS
========================================================= */

function setupButtonEvents() {

  const cameraBtn =
    $("cameraBtn");

  const micBtn =
    $("micBtn");

  const nextBtn =
    $("nextBtn");

  const reportBtn =
    $("reportBtn");

  const chatBtn =
    $("chatBtn");

  const coinBtn =
    $("coinBtn");


  /* CAMERA */

  if (cameraBtn) {

    cameraBtn.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        toggleCamera();
      }
    );
  }


  /* MIC */

  if (micBtn) {

    micBtn.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        toggleMic();
      }
    );
  }


  /* CUT */

  if (nextBtn) {

    nextBtn.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        nextUser();
      }
    );
  }


  /* REPORT */

  if (reportBtn) {

    reportBtn.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        reportUser();
      }
    );
  }


  /* CHAT */

  if (chatBtn) {

    chatBtn.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        openChat();
      }
    );
  }


  /* COIN */

  if (coinBtn) {

    coinBtn.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        openCoins();
      }
    );
  }


  setupLikeButton();
}


/* =========================================================
   INITIALIZE
========================================================= */

async function initializeChat() {

  console.log(
    "VizoChat chat.js started"
  );

  setStatus(
    "Starting VizoChat..."
  );

  updateGuestCounter();

  setupButtonEvents();

  const cameraReady =
    await requestCameraAndMic();

  if (!cameraReady) {
    return;
  }

  await startSearching();
}


/* =========================================================
   PUBLIC VIZOCHAT API
========================================================= */

window.VizoChat = {

  startSearching:
    startSearching,

  nextUser:
    nextUser,

  endChat:
    endChat,

  getUserId:
    getUserId,

  getUserType:
    getUserType,

  getCurrentMatchId:
    function() {
      return currentMatchId;
    },

  getCurrentPartnerId:
    function() {
      return currentPartnerId;
    },

  isConnected:
    function() {
      return connected;
    }

};


/* =========================================================
   START CHAT
========================================================= */

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


/* =========================================================
   PAGE CLOSE
========================================================= */

window.addEventListener(
  "beforeunload",
  function() {

    endChat();

    if (socket) {

      try {
        socket.disconnect();
      } catch (error) {}
    }

    if (localStream) {

      localStream
        .getTracks()
        .forEach(
          function(track) {

            track.stop();
          }
        );
    }
  }
);
