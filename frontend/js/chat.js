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

const remoteVideo =
  document.getElementById(
    "remoteVideo"
  );

const localVideo =
  document.getElementById(
    "localVideo"
  );

const remotePlaceholder =
  document.getElementById(
    "remotePlaceholder"
  );

const localPlaceholder =
  document.getElementById(
    "localPlaceholder"
  );

const statusElement =
  document.getElementById(
    "status"
  ) ||
  document.getElementById(
    "statusElement"
  );

const timerElement =
  document.getElementById(
    "timer"
  ) ||
  document.getElementById(
    "timerElement"
  );

const reportButton =
  document.getElementById(
    "reportBtn"
  );

const likeButton =
  document.getElementById(
    "likeBtn"
  );

const chatButton =
  document.getElementById(
    "chatBtn"
  );

const cameraButton =
  document.getElementById(
    "cameraBtn"
  );

const microphoneButton =
  document.getElementById(
    "micBtn"
  );

const coinButton =
  document.getElementById(
    "coinBtn"
  );

const chatPanel =
  document.getElementById(
    "chatPanel"
  );

const chatCloseButton =
  document.getElementById(
    "chatCloseBtn"
  );

const chatMessages =
  document.getElementById(
    "chatMessages"
  );

const chatForm =
  document.getElementById(
    "chatForm"
  );

const chatInput =
  document.getElementById(
    "chatInput"
  );

const chatSendButton =
  document.getElementById(
    "chatSendBtn"
  );

const chatEmpty =
  document.getElementById(
    "chatEmpty"
  );

const videoArea =
  document.getElementById(
    "videoArea"
  );

/* -----------------------------------------
   AUTH
----------------------------------------- */

function getAuthData() {
  try {
    if (
      window.VizoAuth &&
      typeof window.VizoAuth ===
        "object"
    ) {
      return {
        token:
          typeof window.VizoAuth.getToken ===
          "function"
            ? window.VizoAuth.getToken()
            : localStorage.getItem(
                "vizochat_auth_token"
              ) ||
              localStorage.getItem(
                "vizoAuthToken"
              ),

        userId:
          typeof window.VizoAuth.getUserId ===
          "function"
            ? window.VizoAuth.getUserId()
            : null,

        userType:
          typeof window.VizoAuth.getUserType ===
          "function"
            ? window.VizoAuth.getUserType()
            : null
      };
    }
  } catch (error) {
    console.warn(
      "VizoAuth read error:",
      error
    );
  }

  let user = null;

  try {
    const raw =
      localStorage.getItem(
        "vizochat_user"
      );

    if (raw) {
      user = JSON.parse(raw);
    }
  } catch (error) {
    console.warn(
      "User data parse error:",
      error
    );
  }

  return {
    token:
      localStorage.getItem(
        "vizochat_auth_token"
      ) ||
      localStorage.getItem(
        "vizoAuthToken"
      ),

    userId:
      user?.id ||
      user?._id ||
      user?.userId ||
      null,

    userType:
      user?.type ||
      null
  };
}

/* -----------------------------------------
   STATUS UI
----------------------------------------- */

function setStatus(message) {
  if (statusElement) {
    statusElement.textContent =
      message;
  }

  console.log(
    "VizoChat status:",
    message
  );
}

function setCameraStartingUI() {
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
        "Starting camera...";
    }

    if (text) {
      text.textContent =
        "Allow camera and microphone access to start chatting.";
    }
  }
}

function setSearchingUI() {
  setStatus(
    "Finding someone..."
  );

  if (remotePlaceholder) {
    remotePlaceholder.classList.remove(
      "hidden"
    );

    const title =
      remotePlaceholder.querySelector(
        ".placeholder-title"
      );

    const text =
      remotePlaceholder.querySelector(
        ".placeholder-text"
      );

    if (title) {
      title.textContent =
        "Finding someone...";
    }

    if (text) {
      text.textContent =
        "Please wait while we find a random person for you.";
    }
  }
}

function setConnectedUI() {
  setStatus(
    "Connected"
  );

  if (remotePlaceholder) {
    remotePlaceholder.classList.add(
      "hidden"
    );
  }

  if (reportButton) {
    reportButton.disabled =
      false;
  }

  if (likeButton) {
    likeButton.disabled =
      false;
  }

  if (chatButton) {
    chatButton.disabled =
      false;
    chatButton.classList.remove(
      "disabled"
    );
  }
}

/* -----------------------------------------
   MEDIA
----------------------------------------- */

async function requestMedia() {
  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error(
      "Camera and microphone are not supported."
    );
  }

  setCameraStartingUI();

  try {
    let videoStream = null;

    try {
      videoStream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: "user"
            }
          }
        );
    } catch (cameraError) {
      console.error(
        "Camera permission/error:",
        cameraError
      );

      setStatus(
        "Camera permission required"
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
            "Allow camera access in your browser, then reload the page.";
        }
      }

      throw cameraError;
    }

    localStream =
      videoStream;

    cameraEnabled = true;

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

        try {
          await new Promise(
            (resolve) => {
              const handler =
                () => {
                  localVideo.removeEventListener(
                    "loadedmetadata",
                    handler
                  );

                  resolve();
                };

              localVideo.addEventListener(
                "loadedmetadata",
                handler
              );
            }
          );

          await localVideo.play();
        } catch (playError) {
          console.warn(
            "Local video retry failed:",
            playError
          );
        }
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

    try {
      const audioStream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true
          }
        );

      const audioTracks =
        audioStream.getAudioTracks();

      audioTracks.forEach(
        (track) => {
          localStream.addTrack(
            track
          );
        }
      );

      microphoneEnabled =
        audioTracks.length > 0;

      if (microphoneButton) {
        if (
          microphoneEnabled
        ) {
          microphoneButton.textContent =
            "🎤";

          microphoneButton.classList.add(
            "active"
          );
        } else {
          microphoneButton.textContent =
            "🔇";

          microphoneButton.classList.remove(
            "active"
          );
        }
      }
    } catch (microphoneError) {
      console.warn(
        "Microphone permission/error:",
        microphoneError
      );

      microphoneEnabled =
        false;

      if (microphoneButton) {
        microphoneButton.textContent =
          "🔇";

        microphoneButton.classList.remove(
          "active"
        );
      }

      console.warn(
        "VizoChat: Camera started, but microphone is unavailable."
      );
    }

    return localStream;
  } catch (error) {
    console.error(
      "Camera/microphone error:",
      error
    );

    if (!localStream) {
      setStatus(
        "Camera permission required"
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
            "Allow camera access in your browser, then reload the page.";
        }
      }
    }

    throw error;
  }
}

/* -----------------------------------------
   SOCKET
----------------------------------------- */

async function connectSocket() {
  if (
    typeof io !==
    "function"
  ) {
    throw new Error(
      "Socket.IO failed to load."
    );
  }

  if (socket) {
    try {
      socket.disconnect();
    } catch (error) {
      console.warn(
        "Socket disconnect error:",
        error
      );
    }

    socket = null;
  }

  socket = io(
    VIZO_SOCKET,
    {
      transports: [
        "websocket",
        "polling"
      ],
      withCredentials: false,
      reconnection: true
    }
  );

  return new Promise(
    (resolve, reject) => {
      let settled = false;

      const timeout =
        setTimeout(() => {
          if (settled) {
            return;
          }

          settled = true;

          reject(
            new Error(
              "Socket connection timeout."
            )
          );
        }, 15000);

      socket.on(
        "connect",
        () => {
          if (settled) {
            return;
          }

          settled = true;

          clearTimeout(
            timeout
          );

          console.log(
            "Socket connected:",
            socket.id
          );

          setupSocketEvents(
            socket
          );

          registerUser();

          resolve();
        }
      );

      socket.on(
        "connect_error",
        (error) => {
          console.error(
            "Socket connection error:",
            error
          );

          if (!settled) {
            settled = true;

            clearTimeout(
              timeout
            );

            reject(error);
          }
        }
      );

      socket.on(
        "disconnect",
        (reason) => {
          console.warn(
            "Socket disconnected:",
            reason
          );

          if (
            isSearching
          ) {
            setStatus(
              "Connection lost. Reconnecting..."
            );
          }
        }
      );
    }
  );
}

/* -----------------------------------------
   SOCKET EVENTS
----------------------------------------- */

function setupSocketEvents(
  currentSocket
) {
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
    "match-found",
    async (data) => {
      console.log(
        "Match found:",
        data
      );

      isSearching =
        false;

      isMatched =
        true;

      isConnected =
        false;

      currentMatchId =
        data?.matchId ||
        data?.match_id ||
        data?.id ||
        null;

      currentPartnerId =
        data?.partnerId ||
        data?.partner_id ||
        data?.userId ||
        data?.partner?.id ||
        null;

      isInitiator =
        Boolean(
          data?.isInitiator ||
          data?.initiator
        );

      reportSubmitted =
        false;

      callSeconds =
        0;

      if (timerElement) {
        timerElement.textContent =
          "00:00";
      }

      if (remotePlaceholder) {
        remotePlaceholder.classList.remove(
          "hidden"
        );

        const title =
          remotePlaceholder.querySelector(
            ".placeholder-title"
          );

        const text =
          remotePlaceholder.querySelector(
            ".placeholder-text"
          );

        if (title) {
          title.textContent =
            "Connecting...";
        }

        if (text) {
          text.textContent =
            "Establishing secure video connection.";
        }
      }

      setStatus(
        "Matched. Connecting..."
      );

      try {
        await createPeerConnection();

        if (isInitiator) {
          await createOffer();
        }
      } catch (error) {
        console.error(
          "WebRTC setup error:",
          error
        );

        setStatus(
          "Unable to connect video"
        );
      }
    }
  );

  currentSocket.on(
    "webrtc-offer",
    async (data) => {
      console.log(
        "Received WebRTC offer"
      );

      try {
        if (
          !peerConnection
        ) {
          await createPeerConnection();
        }

        const offer =
          data?.offer ||
          data;

        if (
          !offer
        ) {
          return;
        }

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

        currentSocket.emit(
          "webrtc-answer",
          {
            matchId:
              currentMatchId,

            partnerId:
              currentPartnerId,

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
      console.log(
        "Received WebRTC answer"
      );

      try {
        if (
          !peerConnection
        ) {
          return;
        }

        const answer =
          data?.answer ||
          data;

        if (
          !answer
        ) {
          return;
        }

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(
            answer
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
      const candidate =
        data?.candidate ||
        data;

      if (
        !candidate
      ) {
        return;
      }

      try {
        if (
          peerConnection &&
          peerConnection.remoteDescription
        ) {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              candidate
            )
          );
        } else {
          iceCandidateQueue.push(
            candidate
          );
        }
      } catch (error) {
        console.warn(
          "ICE candidate error:",
          error
        );
      }
    }
  );

  currentSocket.on(
    "webrtc-connected",
    () => {
      console.log(
        "WebRTC connected"
      );

      markConnected();
    }
  );

  currentSocket.on(
    "chat-message",
    (data) => {
      if (!data) {
        return;
      }

      const message =
        data.message ||
        data.text ||
        "";

      if (!message) {
        return;
      }

      addChatMessage(
        message,
        false
      );
    }
  );

  currentSocket.on(
    "partner-left",
    () => {
      console.log(
        "Partner left"
      );

      setStatus(
        "Partner left"
      );

      isMatched =
        false;

      isConnected =
        false;

      cleanupPeer();

      if (remotePlaceholder) {
        remotePlaceholder.classList.remove(
          "hidden"
        );

        const title =
          remotePlaceholder.querySelector(
            ".placeholder-title"
          );

        const text =
          remotePlaceholder.querySelector(
            ".placeholder-text"
          );

        if (title) {
          title.textContent =
            "Partner left";
        }

        if (text) {
          text.textContent =
            "Swipe or press Next to find someone else.";
        }
      }

      stopCallTimer();
    }
  );

  currentSocket.on(
    "match-ended",
    () => {
      console.log(
        "Match ended"
      );

      isMatched =
        false;

      isConnected =
        false;

      cleanupPeer();

      stopCallTimer();

      setStatus(
        "Chat ended"
      );
    }
  );

  currentSocket.on(
    "error",
    (error) => {
      console.error(
        "Socket error:",
        error
      );
    }
  );
}

/* -----------------------------------------
   REGISTER
----------------------------------------- */

function registerUser() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  const auth =
    getAuthData();

  let guestId =
    localStorage.getItem(
      "vizoGuestId"
    );

  if (
    !guestId
  ) {
    guestId =
      "guest_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .slice(2);

    localStorage.setItem(
      "vizoGuestId",
      guestId
    );
  }

  socket.emit(
    "register-user",
    {
      userId:
        auth.userId,

      token:
        auth.token,

      userType:
        auth.userType,

      guestId
    }
  );
}

/* -----------------------------------------
   GUEST LIMIT
----------------------------------------- */

function getGuestMatchCount() {
  const value =
    localStorage.getItem(
      "vizoGuestMatchCount"
    );

  const count =
    Number(value);

  if (
    Number.isFinite(count) &&
    count >= 0
  ) {
    return count;
  }

  return 0;
}

function setGuestMatchCount(
  count
) {
  localStorage.setItem(
    "vizoGuestMatchCount",
    String(
      Math.max(
        0,
        Number(count) || 0
      )
    )
  );
}

function incrementGuestMatchCount() {
  const auth =
    getAuthData();

  const isGuest =
    !auth.userId ||
    auth.userType ===
      "guest";

  if (!isGuest) {
    return;
  }

  const count =
    getGuestMatchCount() +
    1;

  setGuestMatchCount(
    count
  );

  updateGuestCounter();

  return count;
}

function updateGuestCounter() {
  const auth =
    getAuthData();

  const isGuest =
    !auth.userId ||
    auth.userType ===
      "guest";

  if (!isGuest) {
    return;
  }

  const count =
    getGuestMatchCount();

  const elements =
    document.querySelectorAll(
      "[data-guest-counter], .guest-counter"
    );

  elements.forEach(
    (element) => {
      element.textContent =
        `${count}/10 matches used`;
    }
  );
}

function guestLimitReached() {
  const auth =
    getAuthData();

  const isGuest =
    !auth.userId ||
    auth.userType ===
      "guest";

  if (!isGuest) {
    return false;
  }

  return (
    getGuestMatchCount() >=
    10
  );
}

/* -----------------------------------------
   FIND RANDOM USER
----------------------------------------- */

function findRandomUser() {
  if (
    !socket ||
    !socket.connected
  ) {
    setStatus(
      "Connecting..."
    );

    return;
  }

  if (
    guestLimitReached()
  ) {
    setStatus(
      "Login required for more matches"
    );

    setTimeout(() => {
      window.location.href =
        "login.html";
    }, 800);

    return;
  }

  socket.emit(
    "find-random-user"
  );

  console.log(
    "Searching for random user..."
  );
}

function startSearching() {
  if (
    isSearching
  ) {
    return;
  }

  if (
    guestLimitReached()
  ) {
    setStatus(
      "Login required for more matches"
    );

    setTimeout(() => {
      window.location.href =
        "login.html";
    }, 800);

    return;
  }

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

  isInitiator =
    false;

  reportSubmitted =
    false;

  cleanupPeer();

  stopCallTimer();

  setSearchingUI();

  findRandomUser();

  if (searchTimer) {
    clearInterval(
      searchTimer
    );
  }

  searchTimer =
    setInterval(
      () => {
        if (
          !isSearching
        ) {
          clearInterval(
            searchTimer
          );

          searchTimer =
            null;
        }
      },
      1000
    );
}

/* -----------------------------------------
   WEBRTC
----------------------------------------- */

async function createPeerConnection() {
  if (
    peerConnection
  ) {
    return peerConnection;
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

  if (localStream) {
    const tracks =
      localStream.getTracks();

    tracks.forEach(
      (track) => {
        try {
          peerConnection.addTrack(
            track,
            localStream
          );
        } catch (error) {
          console.warn(
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

      const stream =
        event.streams &&
        event.streams[0];

      if (
        !stream
      ) {
        return;
      }

      if (remoteVideo) {
        remoteVideo.srcObject =
          stream;

        remoteVideo
          .play()
          .catch(
            (error) => {
              console.warn(
                "Remote video play error:",
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
      if (
        !peerConnection
      ) {
        return;
      }

      const state =
        peerConnection.connectionState;

      console.log(
        "WebRTC connection state:",
        state
      );

      if (
        state ===
        "connected"
      ) {
        markConnected();
      }

      if (
        state ===
          "failed" ||
        state ===
          "disconnected" ||
        state ===
          "closed"
      ) {
        isConnected =
          false;

        if (
          state !==
          "closed"
        ) {
          setStatus(
            "Connection lost"
          );
        }
      }
    };

  peerConnection.oniceconnectionstatechange =
    () => {
      if (
        !peerConnection
      ) {
        return;
      }

      console.log(
        "ICE connection state:",
        peerConnection.iceConnectionState
      );
    };

  return peerConnection;
}

function markConnected() {
  if (
    isConnected
  ) {
    return;
  }

  isConnected =
    true;

  isSearching =
    false;

  setConnectedUI();

  incrementGuestMatchCount();

  startCallTimer();
}

async function createOffer() {
  if (
    !peerConnection ||
    !socket
  ) {
    return;
  }

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

        partnerId:
          currentPartnerId,

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

async function flushIceCandidates() {
  if (
    !peerConnection ||
    !peerConnection.remoteDescription
  ) {
    return;
  }

  while (
    iceCandidateQueue.length >
    0
  ) {
    const candidate =
      iceCandidateQueue.shift();

    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      );
    } catch (error) {
      console.warn(
        "Queued ICE candidate error:",
        error
      );
    }
  }
}

/* -----------------------------------------
   CLEANUP
----------------------------------------- */

function cleanupPeer() {
  if (
    peerConnection
  ) {
    try {
      peerConnection.ontrack =
        null;

      peerConnection.onicecandidate =
        null;

      peerConnection.onconnectionstatechange =
        null;

      peerConnection.oniceconnectionstatechange =
        null;

      peerConnection.close();
    } catch (error) {
      console.warn(
        "Peer cleanup error:",
        error
      );
    }
  }

  peerConnection =
    null;

  iceCandidateQueue =
    [];

  pendingOffer =
    null;

  if (remoteVideo) {
    try {
      remoteVideo.pause();
    } catch (error) {
      console.warn(
        error
      );
    }

    remoteVideo.srcObject =
      null;
  }
}

/* -----------------------------------------
   NEXT USER
----------------------------------------- */

function nextUser() {
  if (
    guestLimitReached()
  ) {
    window.location.href =
      "login.html";

    return;
  }

  if (
    searchTimer
  ) {
    clearInterval(
      searchTimer
    );

    searchTimer =
      null;
  }

  stopCallTimer();

  cleanupPeer();

  isSearching =
    false;

  isMatched =
    false;

  isConnected =
    false;

  currentMatchId =
    null;

  currentPartnerId =
    null;

  isInitiator =
    false;

  reportSubmitted =
    false;

  if (likeButton) {
    likeButton.disabled =
      true;
  }

  if (reportButton) {
    reportButton.disabled =
      true;
  }

  if (remotePlaceholder) {
    remotePlaceholder.classList.remove(
      "hidden"
    );

    const title =
      remotePlaceholder.querySelector(
        ".placeholder-title"
      );

    const text =
      remotePlaceholder.querySelector(
        ".placeholder-text"
      );

    if (title) {
      title.textContent =
        "Finding someone...";
    }

    if (text) {
      text.textContent =
        "Please wait while we find a random person.";
    }
  }

  startSearching();
}

/* -----------------------------------------
   END CHAT
----------------------------------------- */

function endChat() {
  if (
    socket &&
    socket.connected
  ) {
    socket.emit(
      "end-chat",
      {
        matchId:
          currentMatchId,

        partnerId:
          currentPartnerId
      }
    );
  }

  cleanupPeer();

  stopCallTimer();

  isSearching =
    false;

  isMatched =
    false;

  isConnected =
    false;

  currentMatchId =
    null;

  currentPartnerId =
    null;

  isInitiator =
    false;

  setStatus(
    "Chat ended"
  );

  if (remotePlaceholder) {
    remotePlaceholder.classList.remove(
      "hidden"
    );
  }
}

/* -----------------------------------------
   CAMERA
----------------------------------------- */

function toggleCamera() {
  if (
    !localStream
  ) {
    return;
  }

  const tracks =
    localStream.getVideoTracks();

  if (
    !tracks.length
  ) {
    return;
  }

  cameraEnabled =
    !cameraEnabled;

  tracks.forEach(
    (track) => {
      track.enabled =
        cameraEnabled;
    }
  );

  if (cameraButton) {
    cameraButton.classList.toggle(
      "active",
      cameraEnabled
    );

    cameraButton.classList.toggle(
      "camera-off",
      !cameraEnabled
    );

    cameraButton.textContent =
      cameraEnabled
        ? "📷"
        : "🚫";
  }

  if (localVideo) {
    localVideo.style.opacity =
      cameraEnabled
        ? "1"
        : "0";
  }
}

/* -----------------------------------------
   MICROPHONE
----------------------------------------- */

function toggleMicrophone() {
  if (
    !localStream
  ) {
    return;
  }

  const tracks =
    localStream.getAudioTracks();

  if (
    !tracks.length
  ) {
    setStatus(
      "Microphone unavailable"
    );

    return;
  }

  microphoneEnabled =
    !microphoneEnabled;

  tracks.forEach(
    (track) => {
      track.enabled =
        microphoneEnabled;
    }
  );

  if (microphoneButton) {
    microphoneButton.classList.toggle(
      "active",
      microphoneEnabled
    );

    microphoneButton.textContent =
      microphoneEnabled
        ? "🎤"
        : "🔇";
  }
}

/* -----------------------------------------
   CALL TIMER
----------------------------------------- */

function startCallTimer() {
  stopCallTimer();

  callSeconds =
    0;

  updateCallTimer();

  callTimer =
    setInterval(
      () => {
        callSeconds++;

        updateCallTimer();
      },
      1000
    );
}

function stopCallTimer() {
  if (
    callTimer
  ) {
    clearInterval(
      callTimer
    );

    callTimer =
      null;
  }
}

function updateCallTimer() {
  if (
    !timerElement
  ) {
    return;
  }

  const minutes =
    Math.floor(
      callSeconds / 60
    );

  const seconds =
    callSeconds % 60;

  timerElement.textContent =
    String(minutes).padStart(
      2,
      "0"
    ) +
    ":" +
    String(seconds).padStart(
      2,
      "0"
    );
}

/* -----------------------------------------
   SWIPE
----------------------------------------- */

function setupSwipe() {
  if (
    !videoArea
  ) {
    return;
  }

  videoArea.addEventListener(
    "touchstart",
    (event) => {
      const touch =
        event.changedTouches[0];

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

      if (
        elapsed > 1000
      ) {
        return;
      }

      if (
        Math.abs(deltaX) <
        70
      ) {
        return;
      }

      if (
        Math.abs(deltaX) <=
        Math.abs(deltaY)
      ) {
        return;
      }

      if (
        isMatched ||
        isConnected
      ) {
        nextUser();
      }
    },
    {
      passive: true
    }
  );
}

/* -----------------------------------------
   COINS
----------------------------------------- */

function openCoins() {
  const auth =
    getAuthData();

  if (
    !auth.userId
  ) {
    window.location.href =
      "login.html";

    return;
  }

  window.location.href =
    "coins.html";
}

/* -----------------------------------------
   REPORT
----------------------------------------- */

async function reportCurrentUser() {
  if (
    reportSubmitted
  ) {
    return;
  }

  if (
    !currentPartnerId
  ) {
    return;
  }

  const auth =
    getAuthData();

  if (
    !auth.token
  ) {
    window.location.href =
      "login.html";

    return;
  }

  const reason =
    window.prompt(
      "Reason for reporting this user?"
    );

  if (
    reason ===
      null ||
    !reason.trim()
  ) {
    return;
  }

  try {
    const response =
      await fetch(
        `${VIZO_API}/reports`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${auth.token}`
          },

          body:
            JSON.stringify(
              {
                reportedUserId:
                  currentPartnerId,

                matchId:
                  currentMatchId,

                reason:
                  reason.trim()
              }
            )
        }
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Report failed: ${response.status}`
      );
    }

    reportSubmitted =
      true;

    if (reportButton) {
      reportButton.disabled =
        true;
    }

    setStatus(
      "Report submitted"
    );
  } catch (error) {
    console.error(
      "Report error:",
      error
    );

    setStatus(
      "Unable to submit report"
    );
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

  if (
    !auth.token
  ) {
    window.location.href =
      "login.html";

    return;
  }

  if (
    !likeButton
  ) {
    return;
  }

  likeButton.disabled =
    true;

  try {
    const response =
      await fetch(
        `${VIZO_API}/likes`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${auth.token}`
          },

          body:
            JSON.stringify(
              {
                receiverId:
                  currentPartnerId,

                matchId:
                  currentMatchId
              }
            )
        }
      );

    const data =
      await response
        .json()
        .catch(
          () => ({})
        );

    if (
      !response.ok
    ) {
      throw new Error(
        data?.message ||
          `Like failed: ${response.status}`
      );
    }

    setStatus(
      data?.message ||
        "Like sent"
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

    likeButton.disabled =
      false;
  }
}

/* -----------------------------------------
   CHAT
----------------------------------------- */

function openChatBox() {
  if (
    !chatPanel
  ) {
    return;
  }

  chatPanel.classList.add(
    "open"
  );

  chatPanel.classList.remove(
    "hidden"
  );

  if (chatInput) {
    setTimeout(
      () => {
        chatInput.focus();
      },
      50
    );
  }
}

function closeChatBox() {
  if (
    !chatPanel
  ) {
    return;
  }

  chatPanel.classList.remove(
    "open"
  );
}

function addChatMessage(
  message,
  mine
) {
  if (
    !chatMessages
  ) {
    return;
  }

  if (chatEmpty) {
    chatEmpty.classList.add(
      "hidden"
    );
  }

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    mine
      ? "chat-message mine"
      : "chat-message";

  const text =
    document.createElement(
      "div"
    );

  text.className =
    "chat-message-text";

  text.textContent =
    message;

  wrapper.appendChild(
    text
  );

  chatMessages.appendChild(
    wrapper
  );

  chatMessages.scrollTop =
    chatMessages.scrollHeight;
}

function sendChatMessage() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }

  if (
    !currentMatchId ||
    !currentPartnerId
  ) {
    return;
  }

  if (
    !chatInput
  ) {
    return;
  }

  const message =
    chatInput.value.trim();

  if (
    !message
  ) {
    return;
  }

  socket.emit(
    "chat-message",
    {
      matchId:
        currentMatchId,

      partnerId:
        currentPartnerId,

      message
    }
  );

  addChatMessage(
    message,
    true
  );

  chatInput.value =
    "";
}

/* -----------------------------------------
   BUTTONS
----------------------------------------- */

function setupButtons() {
  if (cameraButton) {
    cameraButton.addEventListener(
      "click",
      toggleCamera
    );
  }

  if (microphoneButton) {
    microphoneButton.addEventListener(
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

    likeButton.disabled =
      true;
  }

  if (chatButton) {
    chatButton.addEventListener(
      "click",
      openChatBox
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

  if (chatSendButton) {
    chatSendButton.addEventListener(
      "click",
      sendChatMessage
    );
  }

  if (coinButton) {
    coinButton.addEventListener(
      "click",
      openCoins
    );
  }

  const nextButtons =
    document.querySelectorAll(
      "#nextBtn, .next-button, [data-action='next']"
    );

  nextButtons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        nextUser
      );
    }
  );

  const endButtons =
    document.querySelectorAll(
      "#endBtn, .end-button, [data-action='end']"
    );

  endButtons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        endChat
      );
    }
  );

  updateGuestCounter();
}

/* -----------------------------------------
   INITIALIZE
----------------------------------------- */

async function initializeChat() {
  if (
    initialized
  ) {
    return;
  }

  initialized =
    true;

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
   PUBLIC API
----------------------------------------- */

window.VizoChat =
  {
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
