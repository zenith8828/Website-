"use strict";

/*
 * VizoChat Chat Client
 *
 * Supports:
 * Guest <-> Guest
 * Guest <-> Registered
 * Registered <-> Registered
 *
 * Backend events:
 * register-user
 * find-random-user
 * waiting-for-user
 * match-found
 * webrtc-offer
 * webrtc-answer
 * webrtc-ice-candidate
 * webrtc-connected
 * partner-disconnected
 * next-user
 * ready-for-next-user
 * guest-limit-reached
 * match-error
 * server-error
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
let connectionTimer = null;

let pendingIceCandidates = [];

let localVideo = null;
let remoteVideo = null;
let statusElement = null;
let timerElement = null;

const ICE_SERVERS = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ]
};


// ======================================================
// DOM
// ======================================================

function getElements() {
  localVideo =
    document.getElementById("localVideo") ||
    document.querySelector("#local-video") ||
    document.querySelector(".local-video");

  remoteVideo =
    document.getElementById("remoteVideo") ||
    document.querySelector("#remote-video") ||
    document.querySelector(".remote-video");

  statusElement =
    document.getElementById("status") ||
    document.getElementById("statusText") ||
    document.querySelector(".status");

  timerElement =
    document.getElementById("timer") ||
    document.getElementById("chatTimer") ||
    document.querySelector(".timer");
}


// ======================================================
// AUTH / USER
// ======================================================

function getAuthData() {
  let userId = "";
  let isGuest = true;

  try {
    /*
     * VizoAuth is preferred if auth.js is loaded.
     */
    if (
      window.VizoAuth &&
      typeof window.VizoAuth.isLoggedIn === "function" &&
      window.VizoAuth.isLoggedIn()
    ) {
      isGuest = false;

      /*
       * Try common auth.js functions/properties.
       */
      if (
        typeof window.VizoAuth.getUser === "function"
      ) {
        const user =
          window.VizoAuth.getUser();

        if (user) {
          userId =
            user.id ||
            user._id ||
            user.userId ||
            user.googleId ||
            "";
        }
      }

      if (!userId) {
        userId =
          localStorage.getItem("vizoUserId") ||
          localStorage.getItem("userId") ||
          localStorage.getItem("user_id") ||
          "";
      }
    }
  } catch (error) {
    console.warn(
      "[AUTH] Unable to read VizoAuth:",
      error
    );
  }


  /*
   * Fallback localStorage auth.
   */
  if (!userId) {
    const storedUserKeys = [
      "vizoUser",
      "user",
      "currentUser"
    ];

    for (const key of storedUserKeys) {
      try {
        const raw =
          localStorage.getItem(key);

        if (!raw) {
          continue;
        }

        const user =
          JSON.parse(raw);

        if (user) {
          userId =
            user.id ||
            user._id ||
            user.userId ||
            user.googleId ||
            "";

          if (userId) {
            isGuest = false;
            break;
          }
        }
      } catch (error) {
        // Ignore invalid localStorage JSON.
      }
    }
  }


  /*
   * If a logged-in token exists, treat user as registered.
   */
  if (!userId) {
    const token =
      localStorage.getItem("vizoToken") ||
      localStorage.getItem("token") ||
      localStorage.getItem("authToken");

    if (token) {
      userId =
        localStorage.getItem("vizoUserId") ||
        localStorage.getItem("userId") ||
        "";

      if (userId) {
        isGuest = false;
      }
    }
  }


  /*
   * Guest gets a permanent unique ID for this browser.
   *
   * Important:
   * Guest ID must NOT be the same for everyone.
   */
  if (!userId) {
    let guestId =
      localStorage.getItem(
        "vizoGuestId"
      );

    if (!guestId) {
      guestId =
        "guest-" +
        Date.now() +
        "-" +
        Math.random()
          .toString(36)
          .substring(2, 12);

      localStorage.setItem(
        "vizoGuestId",
        guestId
      );
    }

    userId = guestId;
    isGuest = true;
  }


  return {
    userId: String(userId),
    isGuest
  };
}


// ======================================================
// STATUS
// ======================================================

function setStatus(message) {
  console.log("[STATUS]", message);

  if (statusElement) {
    statusElement.textContent =
      message;
  }

  /*
   * Support other possible status elements.
   */
  const elements = [
    document.getElementById("searchStatus"),
    document.getElementById("connectionStatus")
  ];

  elements.forEach((element) => {
    if (element) {
      element.textContent =
        message;
    }
  });
}


// ======================================================
// TIMER
// ======================================================

let timerSeconds = 0;

function resetTimer() {
  timerSeconds = 0;

  if (timerElement) {
    timerElement.textContent =
      "00:00";
  }
}

function startTimer() {
  stopTimer();

  timerSeconds = 0;

  connectionTimer =
    setInterval(() => {
      timerSeconds++;

      const minutes =
        Math.floor(
          timerSeconds / 60
        );

      const seconds =
        timerSeconds % 60;

      const text =
        String(minutes).padStart(
          2,
          "0"
        ) +
        ":" +
        String(seconds).padStart(
          2,
          "0"
        );

      if (timerElement) {
        timerElement.textContent =
          text;
      }
    }, 1000);
}

function stopTimer() {
  if (connectionTimer) {
    clearInterval(
      connectionTimer
    );

    connectionTimer = null;
  }
}


// ======================================================
// MEDIA
// ======================================================

async function requestMedia() {
  if (
    localStream &&
    localStream.getTracks().length
  ) {
    return localStream;
  }

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error(
      "Camera and microphone are not supported by this browser."
    );
  }

  setStatus(
    "Camera and microphone permission..."
  );

  localStream =
    await navigator.mediaDevices.getUserMedia(
      {
        video: true,
        audio: true
      }
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
        "[MEDIA] Local video play:",
        error
      );
    }
  }

  return localStream;
}


// ======================================================
// SOCKET CONNECTION
// ======================================================

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


      if (typeof io !== "function") {
        reject(
          new Error(
            "Socket.IO is not loaded."
          )
        );

        return;
      }


      setStatus(
        "Connecting to server..."
      );


      socket =
        io(VIZO_SOCKET, {
          transports: [
            "websocket",
            "polling"
          ],
          reconnection: true,
          reconnectionAttempts: 10,
          timeout: 20000
        });


      let settled = false;


      socket.on(
        "connect",
        () => {

          console.log(
            "[SOCKET] Connected:",
            socket.id
          );

          if (!settled) {
            settled = true;
            resolve(socket);
          }


          /*
           * Register immediately after socket connects.
           */
          registerUser();
        }
      );


      socket.on(
        "connect_error",
        (error) => {

          console.error(
            "[SOCKET] Connection error:",
            error
          );

          setStatus(
            "Server connection failed. Retrying..."
          );

          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      );


      socket.on(
        "disconnect",
        (reason) => {

          console.log(
            "[SOCKET] Disconnected:",
            reason
          );

          isConnected = false;

          stopTimer();

          if (!isSearching) {
            setStatus(
              "Disconnected from server."
            );
          }
        }
      );


      setupSocketEvents();
    }
  );
}


// ======================================================
// REGISTER USER
// ======================================================

function registerUser() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }


  const auth =
    getAuthData();


  console.log(
    "[REGISTER]",
    auth
  );


  socket.emit(
    "register-user",
    {
      userId:
        auth.userId,

      isGuest:
        auth.isGuest,

      userType:
        auth.isGuest
          ? "guest"
          : "registered"
    }
  );
}


// ======================================================
// SOCKET EVENTS
// ======================================================

let socketEventsRegistered = false;

function setupSocketEvents() {
  if (
    socketEventsRegistered ||
    !socket
  ) {
    return;
  }

  socketEventsRegistered = true;


  // ----------------------------------------------
  // REGISTERED
  // ----------------------------------------------

  socket.on(
    "registered",
    (data) => {

      console.log(
        "[REGISTERED]",
        data
      );

      if (isSearching) {
        findRandomUser();
      }
    }
  );


  // ----------------------------------------------
  // WAITING
  // ----------------------------------------------

  socket.on(
    "waiting-for-user",
    (data) => {

      console.log(
        "[WAITING]",
        data
      );

      isSearching = true;
      isMatched = false;
      isConnected = false;

      setStatus(
        "Searching for someone..."
      );

      startSearchAnimation();
    }
  );


  // ----------------------------------------------
  // MATCH FOUND
  // ----------------------------------------------

  socket.on(
    "match-found",
    async (data) => {

      console.log(
        "[MATCH FOUND]",
        data
      );

      stopSearchAnimation();

      isSearching = false;
      isMatched = true;
      isConnected = false;

      currentMatchId =
        data.matchId || null;

      currentPartnerId =
        data.partnerId || null;

      isInitiator =
        Boolean(data.initiator);


      if (!currentMatchId) {
        setStatus(
          "Invalid match. Searching again..."
        );

        restartSearch();

        return;
      }


      setStatus(
        "Person found. Connecting..."
      );


      try {
        await createPeerConnection();


        /*
         * Only initiator creates offer.
         */
        if (isInitiator) {
          await createOffer();
        }

      } catch (error) {

        console.error(
          "[WEBRTC] Match setup failed:",
          error
        );

        setStatus(
          "Connection failed. Finding another person..."
        );

        restartSearch();
      }
    }
  );


  // ----------------------------------------------
  // WEBRTC OFFER
  // ----------------------------------------------

  socket.on(
    "webrtc-offer",
    async (data) => {

      console.log(
        "[WEBRTC] Offer received"
      );

      if (
        !data ||
        !data.offer ||
        !data.matchId
      ) {
        return;
      }


      if (
        currentMatchId &&
        data.matchId !==
          currentMatchId
      ) {
        return;
      }


      currentMatchId =
        data.matchId;


      try {

        await createPeerConnection();


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


        socket.emit(
          "webrtc-answer",
          {
            matchId:
              currentMatchId,

            answer:
              peerConnection.localDescription
          }
        );


        setStatus(
          "Connecting video..."
        );

      } catch (error) {

        console.error(
          "[WEBRTC] Offer error:",
          error
        );

        restartSearch();
      }
    }
  );


  // ----------------------------------------------
  // WEBRTC ANSWER
  // ----------------------------------------------

  socket.on(
    "webrtc-answer",
    async (data) => {

      console.log(
        "[WEBRTC] Answer received"
      );

      if (
        !data ||
        !data.answer ||
        !data.matchId ||
        !peerConnection
      ) {
        return;
      }


      if (
        currentMatchId &&
        data.matchId !==
          currentMatchId
      ) {
        return;
      }


      try {

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(
            data.answer
          )
        );


        await flushPendingIceCandidates();

      } catch (error) {

        console.error(
          "[WEBRTC] Answer error:",
          error
        );
      }
    }
  );


  // ----------------------------------------------
  // ICE CANDIDATE
  // ----------------------------------------------

  socket.on(
    "webrtc-ice-candidate",
    async (data) => {

      if (
        !data ||
        !data.candidate ||
        !data.matchId
      ) {
        return;
      }


      if (
        currentMatchId &&
        data.matchId !==
          currentMatchId
      ) {
        return;
      }


      if (
        !peerConnection
      ) {
        pendingIceCandidates.push(
          data.candidate
        );

        return;
      }


      try {

        if (
          peerConnection.remoteDescription
        ) {

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              data.candidate
            )
          );

        } else {

          pendingIceCandidates.push(
            data.candidate
          );
        }

      } catch (error) {

        console.warn(
          "[WEBRTC] ICE candidate error:",
          error
        );
      }
    }
  );


  // ----------------------------------------------
  // PARTNER DISCONNECTED
  // ----------------------------------------------

  socket.on(
    "partner-disconnected",
    (data) => {

      console.log(
        "[PARTNER DISCONNECTED]",
        data
      );

      cleanupPeer();

      isSearching = false;
      isMatched = false;
      isConnected = false;

      setStatus(
        "Person disconnected."
      );


      /*
       * Automatically search for another user.
       */
      setTimeout(() => {

        if (
          socket &&
          socket.connected
        ) {
          startSearching();
        }

      }, 800);
    }
  );


  // ----------------------------------------------
  // READY FOR NEXT USER
  // ----------------------------------------------

  socket.on(
    "ready-for-next-user",
    () => {

      console.log(
        "[NEXT] Ready"
      );

      cleanupPeer();

      currentMatchId = null;
      currentPartnerId = null;

      isSearching = false;
      isMatched = false;
      isConnected = false;

      resetTimer();

      startSearching();
    }
  );


  // ----------------------------------------------
  // GUEST LIMIT
  // ----------------------------------------------

  socket.on(
    "guest-limit-reached",
    (data) => {

      console.warn(
        "[GUEST LIMIT]",
        data
      );

      cleanupPeer();

      isSearching = false;
      isMatched = false;
      isConnected = false;

      stopSearchAnimation();

      setStatus(
        data &&
        data.message
          ? data.message
          : "Guest limit finished. Please login with Google."
      );


      /*
       * Give login button/page a chance.
       */
      setTimeout(() => {

        const loginButton =
          document.querySelector(
            "[data-login]"
          );

        if (loginButton) {
          loginButton.style.display =
            "";
        }

      }, 100);
    }
  );


  // ----------------------------------------------
  // MATCH ERROR
  // ----------------------------------------------

  socket.on(
    "match-error",
    (data) => {

      console.error(
        "[MATCH ERROR]",
        data
      );

      if (
        data &&
        data.message
      ) {
        setStatus(
          data.message
        );
      }


      isSearching = false;

      setTimeout(() => {

        if (
          socket &&
          socket.connected &&
          !isMatched
        ) {
          startSearching();
        }

      }, 1000);
    }
  );


  // ----------------------------------------------
  // SERVER ERROR
  // ----------------------------------------------

  socket.on(
    "server-error",
    (data) => {

      console.error(
        "[SERVER ERROR]",
        data
      );

      setStatus(
        data &&
        data.message
          ? data.message
          : "Server error."
      );
    }
  );
}


// ======================================================
// FIND RANDOM USER
// ======================================================

function findRandomUser() {
  if (
    !socket ||
    !socket.connected
  ) {
    return;
  }


  const auth =
    getAuthData();


  /*
   * Make sure server has the latest
   * guest/registered state.
   */
  socket.emit(
    "register-user",
    {
      userId:
        auth.userId,

      isGuest:
        auth.isGuest,

      userType:
        auth.isGuest
          ? "guest"
          : "registered"
    }
  );


  /*
   * Small delay so register-user
   * reaches server first.
   */
  setTimeout(() => {

    if (
      socket &&
      socket.connected &&
      !isMatched
    ) {

      console.log(
        "[SEARCH] find-random-user"
      );

      socket.emit(
        "find-random-user"
      );
    }

  }, 100);
}


// ======================================================
// START SEARCHING
// ======================================================

async function startSearching() {

  if (isSearching) {
    return;
  }


  if (isMatched) {
    return;
  }


  stopSearchAnimation();

  cleanupPeer();


  currentMatchId = null;
  currentPartnerId = null;

  isMatched = false;
  isConnected = false;

  resetTimer();


  isSearching = true;

  setStatus(
    "Starting..."
  );


  try {

    await requestMedia();

    await connectSocket();


    /*
     * Socket may already be connected.
     * Ensure registration before searching.
     */
    registerUser();


    setTimeout(() => {

      if (
        socket &&
        socket.connected &&
        isSearching &&
        !isMatched
      ) {
        findRandomUser();
      }

    }, 250);

  } catch (error) {

    console.error(
      "[START] Failed:",
      error
    );

    isSearching = false;

    setStatus(
      "Camera/microphone or server connection failed."
    );
  }
}


// ======================================================
// RESTART SEARCH
// ======================================================

function restartSearch() {

  stopSearchAnimation();

  cleanupPeer();

  currentMatchId = null;
  currentPartnerId = null;

  isMatched = false;
  isConnected = false;

  isSearching = false;

  resetTimer();


  setTimeout(() => {

    if (
      socket &&
      socket.connected
    ) {
      startSearching();
    } else {
      startSearching();
    }

  }, 500);
}


// ======================================================
// SEARCH ANIMATION
// ======================================================

function startSearchAnimation() {
  stopSearchAnimation();

  let dots = 0;

  searchTimer =
    setInterval(() => {

      if (!isSearching) {
        stopSearchAnimation();
        return;
      }

      dots =
        (dots + 1) % 4;

      const text =
        "Searching for someone" +
        ".".repeat(dots);

      setStatus(text);

    }, 700);
}

function stopSearchAnimation() {
  if (searchTimer) {
    clearInterval(
      searchTimer
    );

    searchTimer = null;
  }
}


// ======================================================
// WEBRTC
// ======================================================

async function createPeerConnection() {

  if (
    peerConnection
  ) {
    return peerConnection;
  }


  peerConnection =
    new RTCPeerConnection(
      ICE_SERVERS
    );


  pendingIceCandidates =
    pendingIceCandidates || [];


  /*
   * Add local tracks.
   */
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


  /*
   * Remote tracks.
   */
  peerConnection.ontrack =
    async (event) => {

      console.log(
        "[WEBRTC] Remote track received"
      );


      if (!remoteVideo) {
        getElements();
      }


      if (!remoteVideo) {
        return;
      }


      /*
       * Prefer the first MediaStream.
       */
      if (
        event.streams &&
        event.streams[0]
      ) {

        remoteVideo.srcObject =
          event.streams[0];

      } else {

        let stream =
          remoteVideo.srcObject;

        if (!stream) {
          stream =
            new MediaStream();

          remoteVideo.srcObject =
            stream;
        }

        event.track &&
          stream.addTrack(
            event.track
          );
      }


      remoteVideo.autoplay =
        true;

      remoteVideo.playsInline =
        true;


      try {
        await remoteVideo.play();
      } catch (error) {
        console.warn(
          "[VIDEO] Remote play:",
          error
        );
      }


      isConnected = true;
      isSearching = false;

      setStatus(
        "Connected"
      );

      startTimer();


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
    };


  /*
   * ICE candidates.
   */
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


  /*
   * Connection state.
   */
  peerConnection.onconnectionstatechange =
    () => {

      if (!peerConnection) {
        return;
      }


      const state =
        peerConnection.connectionState;


      console.log(
        "[WEBRTC] Connection state:",
        state
      );


      if (
        state === "connected"
      ) {

        isConnected = true;
        isSearching = false;

        setStatus(
          "Connected"
        );

        startTimer();


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
      }


      if (
        state === "failed" ||
        state === "closed"
      ) {

        isConnected = false;

        stopTimer();

        console.warn(
          "[WEBRTC] Connection ended:",
          state
        );
      }
    };


  /*
   * ICE connection state.
   */
  peerConnection.oniceconnectionstatechange =
    () => {

      if (!peerConnection) {
        return;
      }


      console.log(
        "[WEBRTC] ICE:",
        peerConnection.iceConnectionState
      );
    };


  return peerConnection;
}


// ======================================================
// CREATE OFFER
// ======================================================

async function createOffer() {

  if (
    !peerConnection ||
    !socket ||
    !socket.connected ||
    !currentMatchId
  ) {
    return;
  }


  console.log(
    "[WEBRTC] Creating offer..."
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


  setStatus(
    "Calling..."
  );
}


// ======================================================
// ICE QUEUE
// ======================================================

async function flushPendingIceCandidates() {

  if (
    !peerConnection ||
    !peerConnection.remoteDescription
  ) {
    return;
  }


  if (
    !pendingIceCandidates.length
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
        new RTCIceCandidate(
          candidate
        )
      );

    } catch (error) {

      console.warn(
        "[WEBRTC] Queued ICE error:",
        error
      );
    }
  }
}


// ======================================================
// CLEANUP PEER
// ======================================================

function cleanupPeer() {

  stopTimer();


  if (peerConnection) {

    try {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;

      peerConnection.close();

    } catch (error) {
      console.warn(
        "[WEBRTC] Cleanup:",
        error
      );
    }

    peerConnection = null;
  }


  pendingIceCandidates = [];


  if (remoteVideo) {

    try {
      remoteVideo.pause();
    } catch (error) {}

    remoteVideo.srcObject = null;
  }
}


// ======================================================
// NEXT USER
// ======================================================

function nextUser() {

  console.log(
    "[ACTION] Next user"
  );


  stopSearchAnimation();

  cleanupPeer();


  currentMatchId = null;
  currentPartnerId = null;

  isSearching = false;
  isMatched = false;
  isConnected = false;

  resetTimer();


  if (
    socket &&
    socket.connected
  ) {

    setStatus(
      "Finding next person..."
    );

    socket.emit(
      "next-user"
    );

  } else {

    startSearching();
  }
}


// ======================================================
// END CHAT
// ======================================================

function endChat() {

  console.log(
    "[ACTION] End chat"
  );


  stopSearchAnimation();

  cleanupPeer();


  if (
    socket &&
    socket.connected
  ) {

    socket.emit(
      "end-chat"
    );
  }


  currentMatchId = null;
  currentPartnerId = null;

  isSearching = false;
  isMatched = false;
  isConnected = false;


  setStatus(
    "Chat ended."
  );
}


// ======================================================
// CAMERA / MIC CONTROLS
// ======================================================

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
    (track) => {
      track.enabled =
        enabled;
    }
  );
}


function toggleMicrophone() {

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
    (track) => {
      track.enabled =
        enabled;
    }
  );
}


// ======================================================
// COINS
// ======================================================

function openCoins() {
  window.location.href =
    "./profile.html";
}


// ======================================================
// BUTTON EVENTS
// ======================================================

function setupButtons() {

  /*
   * Next / Cut
   */
  const nextButtons =
    document.querySelectorAll(
      "#nextBtn, #nextButton, .next-btn, [data-action='next'], [data-next]"
    );


  nextButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        nextUser
      );

    }
  );


  /*
   * End / Cut
   */
  const endButtons =
    document.querySelectorAll(
      "#cutBtn, #endBtn, #endChatBtn, .cut-btn, [data-action='end']"
    );


  endButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        endChat
      );

    }
  );


  /*
   * Camera
   */
  const cameraButtons =
    document.querySelectorAll(
      "#cameraBtn, #cameraButton, [data-action='camera']"
    );


  cameraButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        toggleCamera
      );

    }
  );


  /*
   * Microphone
   */
  const micButtons =
    document.querySelectorAll(
      "#micBtn, #micButton, [data-action='mic'], [data-action='microphone']"
    );


  micButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        toggleMicrophone
      );

    }
  );


  /*
   * Coins
   */
  const coinButtons =
    document.querySelectorAll(
      "#coinBtn, #coinsBtn, #coinButton, [data-action='coins']"
    );


  coinButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        openCoins
      );

    }
  );
}


// ======================================================
// INITIALIZE
// ======================================================

async function initializeChat() {

  console.log(
    "========================================"
  );

  console.log(
    "VizoChat Chat Initializing..."
  );

  console.log(
    "========================================"
  );


  getElements();

  setupButtons();


  resetTimer();


  /*
   * Show local media and start search.
   */
  try {

    await startSearching();

  } catch (error) {

    console.error(
      "[INIT] Error:",
      error
    );

    setStatus(
      "Unable to start chat."
    );
  }
}


// ======================================================
// PAGE EXIT
// ======================================================

window.addEventListener(
  "beforeunload",
  () => {

    try {

      if (
        socket &&
        socket.connected
      ) {

        socket.emit(
          "end-chat"
        );
      }

    } catch (error) {}


    try {

      if (socket) {
        socket.disconnect();
      }

    } catch (error) {}


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


// ======================================================
// PUBLIC API
// ======================================================

window.VizoChat = {

  startSearching,

  nextUser,

  endChat,

  toggleCamera,

  toggleMicrophone,

  openCoins,

  getAuthData,

  getSocket: () => socket,

  getMatchId: () =>
    currentMatchId,

  isSearching: () =>
    isSearching,

  isMatched: () =>
    isMatched,

  isConnected: () =>
    isConnected
};


// ======================================================
// DOM READY
// ======================================================

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
