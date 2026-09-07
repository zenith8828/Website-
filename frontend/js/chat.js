"use strict";

/* =========================================
   VizoChat Chat System
========================================= */

const CHAT_API =
  window.VizoAuth?.VIZOCHAT_API ||
  "https://website-r746.onrender.com/api";

const SOCKET_IO_URL =
  "https://cdn.socket.io/4.8.1/socket.io.min.js";

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

/*
  ICE candidates can arrive before the remote
  description is ready. Store them temporarily.
*/
let pendingIceCandidates = [];


/* =========================================
   DOM
========================================= */

const localVideo =
  document.getElementById("localVideo");

const remoteVideo =
  document.getElementById("remoteVideo");

const statusElement =
  document.getElementById("status");

const timerElement =
  document.getElementById("timer");

const guestCounter =
  document.getElementById("guestCounter");

const cameraButton =
  document.getElementById("cameraButton");

const micButton =
  document.getElementById("micButton");

const nextButton =
  document.getElementById("nextButton");

const reportButton =
  document.getElementById("reportButton");


/* =========================================
   STATUS
========================================= */

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;
  }

  console.log("[VizoChat]", message);
}


/* =========================================
   GUEST COUNTER
========================================= */

function updateGuestCounter() {
  if (!guestCounter || !window.VizoAuth) {
    return;
  }

  if (window.VizoAuth.isGuest()) {
    const used =
      window.VizoAuth.getGuestMatchCount();

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
          if (window.io) {
            socketLoaded = true;
            resolve();
          } else {
            reject(
              new Error("Socket.IO failed to load.")
            );
          }
        },
        { once: true }
      );

      existingScript.addEventListener(
        "error",
        () => {
          reject(
            new Error("Unable to load Socket.IO.")
          );
        },
        { once: true }
      );

      return;
    }

    const script =
      document.createElement("script");

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
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(
        "Camera API is not available."
      );
    }

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
        console.log(
          "Local video autoplay blocked."
        );
      }
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

    socket =
      window.io(
        CHAT_API.replace("/api", ""),
        {
          transports: [
            "websocket",
            "polling"
          ],
          reconnection: true,
          reconnectionAttempts: 10,
          timeout: 10000
        }
      );

    setupSocketEvents();

    return await new Promise((resolve) => {
      let finished = false;

      const finish = (result) => {
        if (finished) return;

        finished = true;
        resolve(result);
      };

      const timeout =
        setTimeout(() => {
          console.error(
            "Socket connection timeout."
          );

          finish(false);
        }, 10000);

      socket.once(
        "connect",
        () => {
          clearTimeout(timeout);

          console.log(
            "Connected to VizoChat:",
            socket.id
          );

          registerSocketUser();

          finish(true);
        }
      );

      socket.once(
        "connect_error",
        (error) => {
          clearTimeout(timeout);

          console.error(
            "Socket connection error:",
            error
          );

          finish(false);
        }
      );
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

  console.log(
    "Registering socket user:",
    userId,
    isGuest
  );

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

  /*
    Remove old listeners first.
    Prevents duplicate events after reconnect.
  */

  socket.off("match-found");
  socket.off("waiting-for-user");
  socket.off("match-error");
  socket.off("guest-limit-reached");
  socket.off("server-error");
  socket.off("partner-disconnected");

  socket.off("webrtc-offer");
  socket.off("webrtc-answer");
  socket.off("webrtc-ice-candidate");

  socket.off("connect_error");
  socket.off("disconnect");


  /* =====================================
     WAITING
  ===================================== */

  socket.on(
    "waiting-for-user",
    (data) => {
      console.log(
        "Waiting:",
        data
      );

      setStatus(
        data?.message ||
        "Waiting for someone new..."
      );
    }
  );


  /* =====================================
     MATCH FOUND
  ===================================== */

  socket.on(
    "match-found",
    async (data) => {
      console.log(
        "MATCH FOUND:",
        data
      );

      await handleMatchFound(data);
    }
  );


  /* =====================================
     MATCH ERROR
  ===================================== */

  socket.on(
    "match-error",
    (data) => {
      console.error(
        "Match error:",
        data
      );

      setStatus(
        data?.message ||
        "Unable to find a match."
      );
    }
  );


  /* =====================================
     GUEST LIMIT
  ===================================== */

  socket.on(
    "guest-limit-reached",
    (data) => {
      setStatus(
        data?.message ||
        "Your guest limit has been reached."
      );

      setTimeout(() => {
        window.location.href =
          "login.html";
      }, 1200);
    }
  );


  /* =====================================
     SERVER ERROR
  ===================================== */

  socket.on(
    "server-error",
    (data) => {
      console.error(
        "Server error:",
        data
      );

      setStatus(
        data?.message ||
        "Server error."
      );
    }
  );


  /* =====================================
     PARTNER DISCONNECTED
  ===================================== */

  socket.on(
    "partner-disconnected",
    () => {
      console.log(
        "Partner disconnected."
      );

      handlePartnerDisconnected();
    }
  );


  /* =====================================
     WEBRTC OFFER

     IMPORTANT:
     Server uses "webrtc-offer"
  ===================================== */

  socket.on(
    "webrtc-offer",
    async (data) => {
      console.log(
        "Received WebRTC offer."
      );

      await handleOffer(data);
    }
  );


  /* =====================================
     WEBRTC ANSWER

     IMPORTANT:
     Server uses "webrtc-answer"
  ===================================== */

  socket.on(
    "webrtc-answer",
    async (data) => {
      console.log(
        "Received WebRTC answer."
      );

      await handleAnswer(data);
    }
  );


  /* =====================================
     WEBRTC ICE

     IMPORTANT:
     Server uses "webrtc-ice-candidate"
  ===================================== */

  socket.on(
    "webrtc-ice-candidate",
    async (data) => {
      console.log(
        "Received ICE candidate."
      );

      await handleIceCandidate(data);
    }
  );


  /* =====================================
     SOCKET ERROR
  ===================================== */

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


  /* =====================================
     SOCKET DISCONNECT
  ===================================== */

  socket.on(
    "disconnect",
    (reason) => {
      console.log(
        "Socket disconnected:",
        reason
      );

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
      window.location.href =
        "login.html";
    }, 1200);

    return;
  }

  setStatus(
    "Starting camera and microphone..."
  );

  const mediaStarted =
    await startLocalMedia();

  if (!mediaStarted) {
    return;
  }

  setStatus(
    "Connecting to VizoChat..."
  );

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

  pendingIceCandidates = [];

  console.log(
    "Match:",
    currentMatchId,
    "Partner:",
    currentPartnerId,
    "Initiator:",
    data.initiator
  );

  /*
    Guest counter is local UI only.
    Server also maintains its own guest count.
  */

  if (
    window.VizoAuth?.isGuest()
  ) {
    window.VizoAuth.incrementGuestMatchCount();
    updateGuestCounter();
  }

  setStatus(
    "Match found. Connecting video..."
  );

  startTimer();

  await createPeerConnection();

  /*
    Server tells user A to initiate.
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
        matchId:
          currentMatchId,

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

  pendingIceCandidates = [];

  peerConnection =
    new RTCPeerConnection({
      iceServers: getIceServers()
    });

  console.log(
    "PeerConnection created."
  );


  /* =====================================
     LOCAL TRACKS
  ===================================== */

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


  /* =====================================
     REMOTE TRACK
  ===================================== */

  peerConnection.ontrack =
    (event) => {
      console.log(
        "Remote track received."
      );

      if (
        remoteVideo &&
        event.streams &&
        event.streams[0]
      ) {
        remoteVideo.srcObject =
          event.streams[0];

        remoteVideo
          .play()
          .catch((error) => {
            console.log(
              "Remote autoplay blocked:",
              error
            );
          });
      }
    };


  /* =====================================
     ICE CANDIDATE
  ===================================== */

  peerConnection.onicecandidate =
    (event) => {
      if (
        event.candidate &&
        socket &&
        currentMatchId
      ) {
        console.log(
          "Sending ICE candidate."
        );

        /*
          IMPORTANT:
          Server expects "webrtc-ice-candidate"
        */

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


  /* =====================================
     CONNECTION STATE
  ===================================== */

  peerConnection.onconnectionstatechange =
    () => {
      if (!peerConnection) return;

      const state =
        peerConnection.connectionState;

      console.log(
        "WebRTC connection state:",
        state
      );

      if (state === "connected") {
        setStatus(
          "Video chat connected."
        );
      }

      if (state === "connecting") {
        setStatus(
          "Connecting video..."
        );
      }

      if (
        state === "failed"
      ) {
        setStatus(
          "Video connection failed."
        );
      }

      if (
        state === "disconnected"
      ) {
        setStatus(
          "Video connection interrupted."
        );
      }

      if (
        state === "closed"
      ) {
        setStatus(
          "Video connection closed."
        );
      }
    };


  /* =====================================
     ICE CONNECTION STATE
  ===================================== */

  peerConnection.oniceconnectionstatechange =
    () => {
      if (!peerConnection) return;

      console.log(
        "ICE state:",
        peerConnection.iceConnectionState
      );
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
    console.log(
      "Creating WebRTC offer..."
    );

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    /*
      IMPORTANT:
      Server expects "webrtc-offer"
    */

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
      "WebRTC offer sent."
    );

  } catch (error) {
    console.error(
      "Offer error:",
      error
    );

    setStatus(
      "Unable to start video connection."
    );
  }
}


/* =========================================
   RECEIVE OFFER
========================================= */

async function handleOffer(data) {
  if (!data || !data.offer) {
    return;
  }

  try {
    console.log(
      "Handling WebRTC offer..."
    );

    if (!peerConnection) {
      await createPeerConnection();
    }

    currentMatchId =
      data.matchId ||
      currentMatchId;

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        data.offer
      )
    );

    await flushPendingIceCandidates();

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );

    /*
      IMPORTANT:
      Server expects "webrtc-answer"
    */

    if (socket) {
      socket.emit(
        "webrtc-answer",
        {
          matchId:
            currentMatchId,

          answer:
            peerConnection.localDescription
        }
      );
    }

    console.log(
      "WebRTC answer sent."
    );

  } catch (error) {
    console.error(
      "Offer handling error:",
      error
    );

    setStatus(
      "Unable to establish video connection."
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
    console.log(
      "Handling WebRTC answer..."
    );

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        data.answer
      )
    );

    await flushPendingIceCandidates();

    console.log(
      "Remote answer applied."
    );

  } catch (error) {
    console.error(
      "Answer error:",
      error
    );

    setStatus(
      "Unable to complete video connection."
    );
  }
}


/* =========================================
   RECEIVE ICE CANDIDATE
========================================= */

async function handleIceCandidate(data) {
  if (
    !data ||
    !data.candidate
  ) {
    return;
  }

  try {
    const candidate =
      new RTCIceCandidate(
        data.candidate
      );

    /*
      If remote description is not ready,
      save candidate for later.
    */

    if (
      !peerConnection ||
      !peerConnection.remoteDescription
    ) {
      pendingIceCandidates.push(
        candidate
      );

      console.log(
        "ICE candidate queued."
      );

      return;
    }

    await peerConnection.addIceCandidate(
      candidate
    );

    console.log(
      "ICE candidate added."
    );

  } catch (error) {
    console.error(
      "ICE candidate error:",
      error
    );
  }
}


/* =========================================
   FLUSH ICE QUEUE
========================================= */

async function flushPendingIceCandidates() {
  if (
    !peerConnection ||
    !peerConnection.remoteDescription
  ) {
    return;
  }

  if (!pendingIceCandidates.length) {
    return;
  }

  console.log(
    "Adding queued ICE candidates:",
    pendingIceCandidates.length
  );

  const candidates =
    pendingIceCandidates;

  pendingIceCandidates = [];

  for (
    const candidate of candidates
  ) {
    try {
      await peerConnection.addIceCandidate(
        candidate
      );
    } catch (error) {
      console.error(
        "Queued ICE error:",
        error
      );
    }
  }
}


/* =========================================
   TIMER
========================================= */

function startTimer() {
  stopTimer();

  chatStartTime =
    Date.now();

  timerInterval =
    setInterval(() => {
      if (!timerElement) return;

      const seconds =
        Math.floor(
          (Date.now() -
            chatStartTime) /
          1000
        );

      const minutes =
        Math.floor(
          seconds / 60
        );

      const remainingSeconds =
        seconds % 60;

      timerElement.textContent =
        `${String(minutes).padStart(2, "0")}:` +
        `${String(remainingSeconds).padStart(2, "0")}`;
    }, 1000);
}


function stopTimer() {
  if (timerInterval) {
    clearInterval(
      timerInterval
    );

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

  updateMediaButtons();
}


/* =========================================
   MICROPHONE
========================================= */

function toggleMicrophone() {
  if (!localStream) return;

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

  pendingIceCandidates = [];

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

  stopCurrentPeer();

  chatStarted = false;

  currentMatchId = null;
  currentPartnerId = null;

  pendingIceCandidates = [];

  setStatus(
    "Chat ended. Ready to find someone new."
  );
}


/* =========================================
   STOP PEER
========================================= */

function stopCurrentPeer() {
  stopTimer();

  pendingIceCandidates = [];

  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.oniceconnectionstatechange = null;

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

  if (
    !reason ||
    !reason.trim()
  ) {
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

          body:
            JSON.stringify({
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

    if (
      !response.ok ||
      !data.success
    ) {
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
