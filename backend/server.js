"use strict";

require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const apiRoutes = require("./routes");

const {
  canGuestStartMatch,
  recordGuestMatch
} = require("./services/guestService");

const {
  canUserAccess
} = require("./models/user");

const app = express();
const server = http.createServer(app);


// ========================================
// CONFIGURATION
// ========================================

const PORT = Number(process.env.PORT) || 5000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:3000";


// ========================================
// MIDDLEWARE
// ========================================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],
    credentials: true
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);


// ========================================
// API
// ========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "VizoChat Backend",
    status: "online"
  });
});

app.use("/api", apiRoutes);


// ========================================
// SOCKET.IO
// ========================================

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});


// ========================================
// MATCH STORAGE
// ========================================

const waitingUsers = new Map();
const activeMatches = new Map();
const socketUsers = new Map();


// ========================================
// HELPERS
// ========================================

function isSocketOnline(socketId) {
  return Boolean(
    io.sockets.sockets.get(socketId)
  );
}


function removeFromWaiting(socketId) {
  waitingUsers.delete(socketId);
}


function getActiveMatch(socketId) {
  for (const match of activeMatches.values()) {
    if (
      match.userA === socketId ||
      match.userB === socketId
    ) {
      return match;
    }
  }

  return null;
}


function getPartnerSocketId(match, socketId) {
  if (!match) {
    return null;
  }

  if (match.userA === socketId) {
    return match.userB;
  }

  if (match.userB === socketId) {
    return match.userA;
  }

  return null;
}


function sendToPartner(socket, event, data) {
  const match =
    getActiveMatch(socket.id);

  if (!match) {
    return false;
  }

  const partnerId =
    getPartnerSocketId(
      match,
      socket.id
    );

  if (!partnerId) {
    return false;
  }

  const partner =
    io.sockets.sockets.get(
      partnerId
    );

  if (!partner) {
    return false;
  }

  partner.emit(
    event,
    data
  );

  return true;
}


function endMatch(socketId, reason) {
  const match =
    getActiveMatch(socketId);

  if (!match) {
    removeFromWaiting(socketId);
    return null;
  }

  activeMatches.delete(
    match.matchId
  );

  const partnerId =
    getPartnerSocketId(
      match,
      socketId
    );

  const partner =
    partnerId
      ? io.sockets.sockets.get(partnerId)
      : null;

  if (partner) {
    partner.emit(
      "partner-disconnected",
      {
        matchId: match.matchId,
        reason:
          reason || "ended"
      }
    );
  }

  return match;
}


// ========================================
// REMOVE DEAD WAITING USERS
// ========================================

function cleanWaitingUsers() {
  for (const [socketId, user] of waitingUsers) {
    if (!isSocketOnline(socketId)) {
      waitingUsers.delete(socketId);
      continue;
    }

    if (!socketUsers.has(socketId)) {
      waitingUsers.delete(socketId);
      continue;
    }

    if (!user) {
      waitingUsers.delete(socketId);
    }
  }
}


// ========================================
// SOCKET CONNECTION
// ========================================

io.on("connection", (socket) => {

  console.log(
    `[SOCKET] Connected: ${socket.id}`
  );


  // ======================================
  // REGISTER USER
  // ======================================

  socket.on(
    "register-user",
    (data = {}) => {

      const userId =
        typeof data.userId === "string"
          ? data.userId.trim()
          : "";

      /*
       * Support both:
       * data.isGuest
       * data.userType
       */

      const isGuest =
        typeof data.isGuest === "boolean"
          ? data.isGuest
          : data.userType === "guest";


      if (!userId) {
        socket.emit(
          "server-error",
          {
            message:
              "User ID is required."
          }
        );

        return;
      }


      socketUsers.set(
        socket.id,
        {
          userId,
          isGuest,
          registeredAt: Date.now()
        }
      );


      console.log(
        `[REGISTER] ${socket.id} | ${userId} | guest=${isGuest}`
      );


      socket.emit(
        "registered",
        {
          success: true,
          userId,
          isGuest
        }
      );
    }
  );


  // ======================================
  // FIND RANDOM USER
  // ======================================

  socket.on(
    "find-random-user",
    () => {

      const currentUser =
        socketUsers.get(socket.id);


      if (!currentUser) {
        socket.emit(
          "server-error",
          {
            message:
              "Please register user first."
          }
        );

        return;
      }


      /*
       * User already has an active match.
       */
      if (getActiveMatch(socket.id)) {
        socket.emit(
          "match-error",
          {
            message:
              "You are already in a chat."
          }
        );

        return;
      }


      /*
       * Remove this socket from old
       * waiting position first.
       */
      removeFromWaiting(
        socket.id
      );


      /*
       * Check ban/access.
       */
      if (
        !canUserAccess(
          currentUser.userId
        )
      ) {
        socket.emit(
          "match-error",
          {
            message:
              "You cannot start a chat right now."
          }
        );

        return;
      }


      /*
       * Guest limit.
       */
      if (
        currentUser.isGuest &&
        !canGuestStartMatch(
          currentUser.userId
        )
      ) {
        socket.emit(
          "guest-limit-reached",
          {
            limit: 10,
            message:
              "Your 10 guest matches are finished. Please login with Google."
          }
        );

        return;
      }


      /*
       * Clean dead waiting sockets.
       */
      cleanWaitingUsers();


      // ==================================
      // FIND A REAL WAITING PARTNER
      // ==================================

      let partner = null;


      for (const [
        partnerSocketId,
        waitingUser
      ] of waitingUsers) {

        /*
         * Never match socket with itself.
         */
        if (
          partnerSocketId === socket.id
        ) {
          continue;
        }


        /*
         * Socket must actually exist.
         */
        if (
          !isSocketOnline(
            partnerSocketId
          )
        ) {
          waitingUsers.delete(
            partnerSocketId
          );

          continue;
        }


        const partnerData =
          socketUsers.get(
            partnerSocketId
          );


        if (!partnerData) {
          waitingUsers.delete(
            partnerSocketId
          );

          continue;
        }


        /*
         * Don't match same logged-in user
         * with another tab/device.
         */
        if (
          partnerData.userId ===
          currentUser.userId
        ) {
          continue;
        }


        /*
         * Partner must not already be matched.
         */
        if (
          getActiveMatch(
            partnerSocketId
          )
        ) {
          waitingUsers.delete(
            partnerSocketId
          );

          continue;
        }


        /*
         * Partner must be allowed.
         */
        if (
          !canUserAccess(
            partnerData.userId
          )
        ) {
          waitingUsers.delete(
            partnerSocketId
          );

          continue;
        }


        /*
         * Partner guest limit.
         */
        if (
          partnerData.isGuest &&
          !canGuestStartMatch(
            partnerData.userId
          )
        ) {
          waitingUsers.delete(
            partnerSocketId
          );

          continue;
        }


        /*
         * REAL PARTNER FOUND.
         */
        partner = {
          socketId: partnerSocketId,
          userId: partnerData.userId,
          isGuest: partnerData.isGuest
        };

        break;
      }


      // ==================================
      // NO PARTNER
      // ==================================

      if (!partner) {

        waitingUsers.set(
          socket.id,
          {
            socketId: socket.id,
            userId:
              currentUser.userId,
            isGuest:
              currentUser.isGuest,
            joinedAt:
              Date.now()
          }
        );


        console.log(
          `[WAITING] ${socket.id} is searching. Waiting users=${waitingUsers.size}`
        );


        /*
         * IMPORTANT:
         * Only Searching/Waiting.
         *
         * NO match-found.
         * NO connected.
         * NO timer.
         */
        socket.emit(
          "waiting-for-user",
          {
            message:
              "Searching for someone..."
          }
        );

        return;
      }


      // ==================================
      // CREATE REAL MATCH
      // ==================================

      waitingUsers.delete(
        partner.socketId
      );


      /*
       * Final safety check.
       */
      if (
        !isSocketOnline(
          partner.socketId
        )
      ) {
        socket.emit(
          "waiting-for-user",
          {
            message:
              "Searching for someone..."
          }
        );

        waitingUsers.set(
          socket.id,
          {
            socketId: socket.id,
            userId:
              currentUser.userId,
            isGuest:
              currentUser.isGuest,
            joinedAt:
              Date.now()
          }
        );

        return;
      }


      const matchId =
        `match-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 10)}`;


      const match = {
        matchId,

        userA:
          socket.id,

        userB:
          partner.socketId,

        userAId:
          currentUser.userId,

        userBId:
          partner.userId,

        startedAt:
          new Date(),

        connectedAt:
          null,

        status:
          "matched"
      };


      activeMatches.set(
        matchId,
        match
      );


      /*
       * Record guest matches.
       */
      if (
        currentUser.isGuest
      ) {
        recordGuestMatch(
          currentUser.userId
        );
      }


      if (
        partner.isGuest
      ) {
        recordGuestMatch(
          partner.userId
        );
      }


      const socketA =
        io.sockets.sockets.get(
          match.userA
        );

      const socketB =
        io.sockets.sockets.get(
          match.userB
        );


      /*
       * If either disappeared,
       * don't create the match.
       */
      if (!socketA || !socketB) {

        activeMatches.delete(
          matchId
        );

        if (socketA) {
          waitingUsers.set(
            socketA.id,
            {
              socketId:
                socketA.id,
              userId:
                currentUser.userId,
              isGuest:
                currentUser.isGuest,
              joinedAt:
                Date.now()
            }
          );

          socketA.emit(
            "waiting-for-user",
            {
              message:
                "Searching for someone..."
            }
          );
        }

        return;
      }


      console.log(
        `[MATCH] ${matchId} | ${match.userA} <-> ${match.userB}`
      );


      /*
       * ONLY HERE do we send match-found.
       */

      socketA.emit(
        "match-found",
        {
          matchId,
          partnerId:
            match.userBId,
          initiator:
            true
        }
      );


      socketB.emit(
        "match-found",
        {
          matchId,
          partnerId:
            match.userAId,
          initiator:
            false
        }
      );
    }
  );


  // ======================================
  // WEBRTC CONNECTED
  // ======================================

  socket.on(
    "webrtc-connected",
    (data = {}) => {

      const match =
        getActiveMatch(
          socket.id
        );

      if (!match) {
        return;
      }


      if (
        data.matchId &&
        data.matchId !==
          match.matchId
      ) {
        return;
      }


      if (!match.connectedAt) {

        match.connectedAt =
          new Date();

        match.status =
          "connected";


        console.log(
          `[WEBRTC] Connected: ${match.matchId}`
        );
      }
    }
  );


  // ======================================
  // WEBRTC OFFER
  // ======================================

  socket.on(
    "webrtc-offer",
    (data = {}) => {

      const {
        matchId,
        offer
      } = data;


      if (
        !matchId ||
        !offer
      ) {
        return;
      }


      const match =
        activeMatches.get(
          matchId
        );


      if (!match) {
        return;
      }


      if (
        match.userA !== socket.id &&
        match.userB !== socket.id
      ) {
        return;
      }


      sendToPartner(
        socket,
        "webrtc-offer",
        {
          matchId,
          offer
        }
      );
    }
  );


  // ======================================
  // WEBRTC ANSWER
  // ======================================

  socket.on(
    "webrtc-answer",
    (data = {}) => {

      const {
        matchId,
        answer
      } = data;


      if (
        !matchId ||
        !answer
      ) {
        return;
      }


      const match =
        activeMatches.get(
          matchId
        );


      if (!match) {
        return;
      }


      if (
        match.userA !== socket.id &&
        match.userB !== socket.id
      ) {
        return;
      }


      sendToPartner(
        socket,
        "webrtc-answer",
        {
          matchId,
          answer
        }
      );
    }
  );


  // ======================================
  // ICE CANDIDATE
  // ======================================

  socket.on(
    "webrtc-ice-candidate",
    (data = {}) => {

      const {
        matchId,
        candidate
      } = data;


      if (
        !matchId ||
        !candidate
      ) {
        return;
      }


      const match =
        activeMatches.get(
          matchId
        );


      if (!match) {
        return;
      }


      if (
        match.userA !== socket.id &&
        match.userB !== socket.id
      ) {
        return;
      }


      sendToPartner(
        socket,
        "webrtc-ice-candidate",
        {
          matchId,
          candidate
        }
      );
    }
  );


  // ======================================
  // NEXT USER
  // ======================================

  socket.on(
    "next-user",
    () => {

      console.log(
        `[NEXT] ${socket.id}`
      );


      endMatch(
        socket.id,
        "next-user"
      );


      removeFromWaiting(
        socket.id
      );


      socket.emit(
        "ready-for-next-user"
      );
    }
  );


  // ======================================
  // END CHAT
  // ======================================

  socket.on(
    "end-chat",
    () => {

      console.log(
        `[END] ${socket.id}`
      );


      endMatch(
        socket.id,
        "user-ended-chat"
      );


      removeFromWaiting(
        socket.id
      );
    }
  );


  // ======================================
  // DISCONNECT
  // ======================================

  socket.on(
    "disconnect",
    () => {

      console.log(
        `[SOCKET] Disconnected: ${socket.id}`
      );


      endMatch(
        socket.id,
        "disconnect"
      );


      removeFromWaiting(
        socket.id
      );


      socketUsers.delete(
        socket.id
      );
    }
  );
});


// ========================================
// START SERVER
// ========================================

server.listen(
  PORT,
  () => {

    console.log(
      `VizoChat backend running on port ${PORT}`
    );

    console.log(
      `Frontend URL: ${FRONTEND_URL}`
    );
  }
);
