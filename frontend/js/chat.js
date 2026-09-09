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

let cameraEnabled = true;
let microphoneEnabled = true;

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
  if (!navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      "Camera and microphone are not supported."
    );
  }

  setCameraStartingUI();

  try {
    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

    if (localVideo) {
      localVideo.srcObject =
        localStream;

      try {
        await localVideo.play();
      } catch (error) {
        console.warn(
          "Local video autoplay:",
          error
        );
      }
    }

    cameraEnabled = true;
    microphoneEnabled = true;

    if (cameraButton) {
      cameraButton.classList.add("active");
      cameraButton.classList.remove(
        "camera-off"
      );
      cameraButton.textContent = "📷";
    }

    if (localPlaceholder) {
      localPlaceholder.classList.add(
        "hidden"
      );
    }

    return localStream;

  } catch (error) {
    console.error(
      "Camera/microphone error:",
      error
    );

    setStatus(
      "Camera/microphone permission required"
    );

    if (localPlaceholder) {
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
          "Allow camera and microphone permission, then reload the page.";
      }
    }

    throw error;
  }
}

/* -----------------------------------------
   SOCKET
----------------------------------------- */

function connectSocket() {
  return new Promise((resolve, reject) => {

    if (
      socket &&
      socket.connected
    ) {
      resolve(socket);
      return;
    }

    socket =
      io(VIZO_SOCKET, {
        transports: [
          "websocket",
          "polling"
        ],
        reconnection: true,
        reconnectionAttempts: 10
      });

    let resolved = false;

    socket.on("connect", () => {
      console.log(
        "Socket connected:",
        socket.id
      );

      registerUser();

      if (!resolved) {
        resolved = true;
        resolve(socket);
      }
    });

    socket.on("connect_error", (error) => {
      console.error(
        "Socket connection error:",
        error
      );

      if (!resolved) {
        resolved = true;
        reject(error);
      }

      setStatus(
        "Connection problem"
      );
    });

    setupSocketEvents(socket);
  });
}

function setupSocketEvents(currentSocket) {

  currentSocket.on(
    "registered",
    (data) => {
      console.log(
        "Registered:",
        data
      );
    }
  );

  currentSocket.on(
    "waiting-for-user",
    () => {
      isSearching = true;
      isMatched = false;
      isConnected = false;

      currentPartnerId = null;
      currentMatchId = null;

      reportSubmitted = false;

      setSearchingUI();
      resetChatBox();

      clearCallTimer();
    }
  );

  currentSocket.on(
    "match-found",
    async (data) => {

      console.log(
        "Match found:",
        data
      );

      isSearching = false;
      isMatched = true;
      isConnected = false;

      currentMatchId =
        data?.matchId ||
        data?.id ||
        null;

      currentPartnerId =
        data?.partnerId ||
        data?.userId ||
        data?.partnerUserId ||
        null;

      isInitiator =
        Boolean(data?.initiator);

      reportSubmitted = false;

      if (reportButton) {
        reportButton.disabled =
          !currentPartnerId;
      }

      if (likeButton) {
        likeButton.disabled = true;
      }

      resetChatBox();

      if (remotePlaceholder) {
        remotePlaceholder.classList.remove(
          "hidden"
        );
      }

      setStatus(
        "Connecting..."
      );

      clearCallTimer();

      try {
        createPeerConnection();

        if (isInitiator) {
          await createOffer();
        }

      } catch (error) {
        console.error(
          "Match setup error:",
          error
        );

        setStatus(
          "Connection failed"
        );
      }
    }
  );

  currentSocket.on(
    "webrtc-offer",
    async (data) => {

      try {
        if (!peerConnection) {
          createPeerConnection();
        }

        if (!data?.offer) {
          return;
        }

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(
            data.offer
          )
        );

        await flushIceCandidates();

        const answer =
          await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(
          answer
        );

        currentSocket.emit(
          "webrtc-answer",
          {
            matchId:
              currentMatchId,
            answer
          }
        );

      } catch (error) {
        console.error(
          "Offer handling error:",
          error
        );
      }
    }
  );

  currentSocket.on(
    "webrtc-answer",
    async (data) => {

      try {
        if (
          !peerConnection ||
          !data?.answer
        ) {
          return;
        }

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(
            data.answer
          )
        );

        await flushIceCandidates();

      } catch (error) {
        console.error(
          "Answer handling error:",
          error
        );
      }
    }
  );

  currentSocket.on(
    "webrtc-ice-candidate",
    async (data) => {

      if (!data?.candidate) {
        return;
      }

      const candidate =
        new RTCIceCandidate(
          data.candidate
        );

      if (
        peerConnection &&
        peerConnection.remoteDescription
      ) {
        try {
          await peerConnection.addIceCandidate(
            candidate
          );
        } catch (error) {
          console.warn(
            "ICE candidate error:",
            error
          );
        }
      } else {
        iceCandidateQueue.push(
          candidate
        );
      }
    }
  );

  currentSocket.on(
    "webrtc-connected",
    () => {
      markConnected();
    }
  );

  currentSocket.on(
    "partner-disconnected",
    () => {

      console.log(
        "Partner disconnected"
      );

      cleanupPeer();

      isMatched = false;
      isConnected = false;
      currentPartnerId = null;
      currentMatchId = null;

      if (likeButton) {
        likeButton.disabled = true;
      }

      if (reportButton) {
        reportButton.disabled = true;
      }

      resetChatBox();

      setStatus(
        "Person disconnected"
      );

      clearCallTimer();

      setTimeout(() => {
        startSearching();
      }, 800);
    }
  );

  currentSocket.on(
    "ready-for-next-user",
    () => {

      cleanupPeer();

      isSearching = true;
      isMatched = false;
      isConnected = false;

      currentPartnerId = null;
      currentMatchId = null;

      reportSubmitted = false;

      resetChatBox();
      clearCallTimer();

      setSearchingUI();

      setTimeout(() => {
        findRandomUser();
      }, 150);
    }
  );

  currentSocket.on(
    "guest-limit-reached",
    (data) => {

      isSearching = false;

      setStatus(
        data?.message ||
        "Guest limit reached. Please login to continue."
      );
    }
  );

  currentSocket.on(
    "match-error",
    (data) => {

      console.error(
        "Match error:",
        data
      );

      isSearching = false;

      setStatus(
        data?.message ||
        "Unable to find someone"
      );
    }
  );

  currentSocket.on(
    "server-error",
    (data) => {

      console.error(
        "Server error:",
        data
      );

      setStatus(
        data?.message ||
        "Server error"
      );
    }
  );

  /* TEXT CHAT */

  currentSocket.on(
    "chat-message",
    (data) => {

      if (!data) {
        return;
      }

      if (
        data.matchId &&
        currentMatchId &&
        data.matchId !== currentMatchId
      ) {
        return;
      }

      const message =
        typeof data.message === "string"
          ? data.message.trim()
          : "";

      if (!message) {
        return;
      }

      appendChatMessage(
        message,
        "partner"
      );

      openChatBox();
    }
  );
}

/* -----------------------------------------
   REGISTER
----------------------------------------- */

function registerUser() {

  if (!socket) {
    return;
  }

  const auth =
    getAuthData();

  socket.emit(
    "register-user",
    {
      userId: auth.userId,
      isGuest: auth.isGuest,
      token: auth.token || null
    }
  );
}

/* -----------------------------------------
   FIND RANDOM USER
----------------------------------------- */

function findRandomUser() {

  if (!socket ||
      !socket.connected) {
    return;
  }

  const auth =
    getAuthData();

  isSearching = true;
  isMatched = false;
  isConnected = false;

  setSearchingUI();

  socket.emit(
    "register-user",
    {
      userId: auth.userId,
      isGuest: auth.isGuest,
      token: auth.token || null
    }
  );

  setTimeout(() => {

    if (!socket ||
        !socket.connected) {
      return;
    }

    socket.emit(
      "find-random-user",
      {
        userId: auth.userId,
        isGuest: auth.isGuest
      }
    );

  }, 100);
}

/* -----------------------------------------
   SEARCH
----------------------------------------- */

async function startSearching() {

  if (isSearching) {
    return;
  }

  try {

    if (!socket ||
        !socket.connected) {
      await connectSocket();
    }

    if (!localStream) {
      await requestMedia();
    }

    findRandomUser();

  } catch (error) {

    console.error(
      "Start searching error:",
      error
    );

    setStatus(
      "Unable to start chat"
    );
  }
}

/* -----------------------------------------
   PEER CONNECTION
----------------------------------------- */

function createPeerConnection() {

  cleanupPeer();

  iceCandidateQueue = [];

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
        !remoteVideo ||
        !event.streams ||
        !event.streams[0]
      ) {
        return;
      }

      remoteVideo.srcObject =
        event.streams[0];

      try {
        remoteVideo.play();
      } catch (error) {
        console.warn(
          "Remote video play:",
          error
        );
      }

      markConnected();
    };

  peerConnection.onicecandidate =
    (event) => {

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

  } catch (error) {

    console.error(
      "Report error:",
      error
    );

    reportSubmitted = false;

    setStatus(
      error.message ||
      "Report failed"
    );

    if (reportButton) {
      reportButton.disabled =
        !currentPartnerId;
    }
  }
}

/* -----------------------------------------
   CHAT
----------------------------------------- */

function openChatBox() {

  if (!chatPanel) {
    return;
  }

  if (!isConnected) {
    setStatus(
      "Connect with someone first"
    );
    return;
  }

  chatPanel.classList.add(
    "open"
  );

  enableChat();

  setTimeout(() => {

    if (chatInput) {
      chatInput.focus();
    }

  }, 100);
}

function closeChatBox() {

  if (!chatPanel) {
    return;
  }

  chatPanel.classList.remove(
    "open"
  );
}

function enableChat() {

  if (chatInput) {
    chatInput.disabled = false;
  }

  if (chatSendButton) {
    chatSendButton.disabled = false;
  }
}

function disableChat() {

  if (chatInput) {
    chatInput.disabled = true;
  }

  if (chatSendButton) {
    chatSendButton.disabled = true;
  }
}

function resetChatBox() {

  if (chatMessages) {
    chatMessages.innerHTML = "";

    if (chatEmpty) {
      chatMessages.appendChild(
        chatEmpty
      );
    } else {

      const empty =
        document.createElement(
          "div"
        );

      empty.className =
        "chat-empty";

      empty.textContent =
        "Say hello 👋";

      chatMessages.appendChild(
        empty
      );
    }
  }

  closeChatBox();

  disableChat();
}

function appendChatMessage(
  message,
  type
) {

  if (!chatMessages) {
    return;
  }

  if (chatEmpty &&
      chatEmpty.parentNode === chatMessages) {
    chatEmpty.remove();
  }

  const element =
    document.createElement("div");

  element.className =
    `chat-message ${type}`;

  /*
   * textContent is intentional.
   * It prevents HTML/script injection.
   */
  element.textContent =
    message;

  chatMessages.appendChild(
    element
  );

  chatMessages.scrollTop =
    chatMessages.scrollHeight;
}

function sendChatMessage() {

  if (
    !socket ||
    !socket.connected ||
    !currentMatchId ||
    !isConnected
  ) {
    return;
  }

  if (!chatInput) {
    return;
  }

  const message =
    chatInput.value.trim();

  if (!message) {
    return;
  }

  const safeMessage =
    message.slice(0, 500);

  socket.emit(
    "chat-message",
    {
      matchId:
        currentMatchId,

      message:
        safeMessage
    }
  );

  appendChatMessage(
    safeMessage,
    "me"
  );

  chatInput.value = "";

  chatInput.focus();
}

/* -----------------------------------------
   TIMER
----------------------------------------- */

function startCallTimer() {

  clearCallTimer();

  callSeconds = 0;

  updateCallTimer();

  callTimer =
    setInterval(() => {

      callSeconds++;

      updateCallTimer();

    }, 1000);
}

function clearCallTimer() {

  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }

  callSeconds = 0;

  updateCallTimer();
}

function updateCallTimer() {

  if (!timerElement) {
    return;
  }

  const minutes =
    Math.floor(
      callSeconds / 60
    )
      .toString()
      .padStart(2, "0");

  const seconds =
    (callSeconds % 60)
      .toString()
      .padStart(2, "0");

  timerElement.textContent =
    `${minutes}:${seconds}`;
}

/* -----------------------------------------
   BUTTONS
----------------------------------------- */

function setupButtons() {

  if (reportButton) {

    reportButton.addEventListener(
      "click",
      reportCurrentUser
    );
  }

  if (chatButton) {

    chatButton.addEventListener(
      "click",
      () => {

        if (
          chatPanel &&
          chatPanel.classList.contains(
            "open"
          )
        ) {
          closeChatBox();
        } else {
          openChatBox();
        }
      }
    );
  }

  if (chatCloseButton) {

    chatCloseButton.addEventListener(
      "click",
      closeChatBox
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

  if (coinButton) {

    coinButton.addEventListener(
      "click",
      openCoins
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
   BEFORE UNLOAD
----------------------------------------- */

window.addEventListener(
  "beforeunload",
  () => {

    try {

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

    } catch (error) {}

    if (localStream) {

      localStream
        .getTracks()
        .forEach(
          (track) => track.stop()
        );
    }

    cleanupPeer();
  }
);

/* -----------------------------------------
   PUBLIC API
----------------------------------------- */

window.VizoChat = {

  startSearching,

  nextUser,

  endChat,

  toggleCamera,

  toggleMicrophone,

  openCoins,

  reportCurrentUser,

  openChatBox,

  closeChatBox,

  sendChatMessage,

  getAuthData,

  getSocket: () =>
    socket,

  getMatchId: () =>
    currentMatchId,

  getCurrentMatchId: () =>
    currentMatchId,

  getCurrentPartnerId: () =>
    currentPartnerId,

  isSearching: () =>
    isSearching,

  isMatched: () =>
    isMatched,

  isConnected: () =>
    isConnected
};

/* -----------------------------------------
   START
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
