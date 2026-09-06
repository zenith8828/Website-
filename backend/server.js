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


// ================================
// CONFIGURATION
// ================================

const PORT = Number(process.env.PORT) || 5000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:3000";


// ================================
// MIDDLEWARE
// ================================

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
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));


// ================================
// API ROUTES
// ================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "VizoChat Backend",
    status: "online"
  });
});

app.use("/api", apiRoutes);


// ================================
// SOCKET.IO
// ================================

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});


// ================================
// MATCH STORAGE
// ================================

const waitingUsers = [];
const activeMatches = new Map();
const socketUsers = new Map();


// ================================
// HELPER FUNCTIONS
// ================================

function removeFromWaiting(socketId) {

  const index =
    waitingUsers.findIndex(
      (user) => user.socketId === socketId
    );

  if (index !== -1) {
    waitingUsers.splice(index, 1);
  }
}


function getSocketById(socketId) {
  return io.sockets.sockets.get(socketId) || null;
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


function isValidPartner(socketId, partnerSocketId) {

  const match =
    getActiveMatch(socketId);

  if (!match) {
    return false;
  }

  return (
    getPartnerSocketId(
      match,
      socketId
    ) === partnerSocketId
  );
}


function endMatchForSocket(
  socketId,
  reason = "ended"
) {

  const match =
    getActiveMatch(socketId);

  if (!match) {
    removeFromWaiting(socketId);
    return null;
  }

  activeMatches.delete(match.matchId);

  const partnerSocketId =
    getPartnerSocketId(
      match,
      socketId
    );

  const partnerSocket =
    partnerSocketId
      ? getSocketById(partnerSocketId)
      : null;

  if (partnerSocket) {

    partnerSocket.emit(
      "partner-disconnected",
      {
        matchId: match.matchId,
        reason
      }
    );
  }

  return match;
}


function sendToPartner(
  socket,
  event,
  data
) {

  const match =
    getActiveMatch(socket.id);

  if (!match) {
    return false;
  }

  const partnerSocketId =
    getPartnerSocketId(
      match,
      socket.id
    );

  if (!partnerSocketId) {
    return false;
  }

  const partnerSocket =
    getSocketById(partnerSocketId);

  if (!partnerSocket) {
    return false;
  }

  partnerSocket.emit(
    event,
    data
  );

  return true;
}


// ================================
// SOCKET CONNECTION
// ================================

io.on("connection", (socket) => {

  console.log(
    `Socket connected: ${socket.id}`
  );


  // ================================
  // REGISTER USER
  // ================================

  socket.on(
    "register-user",
    (data = {}) => {

      const userId =
        typeof data.userId === "string"
          ? data.userId.trim()
          : "";

      const isGuest =
        Boolean(data.isGuest);


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
          isGuest
        }
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


  // ================================
  // FIND RANDOM USER
  // ================================

  socket.on(
    "find-random-user",
    (data = {}) => {

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


      // Do not create another match
      // while already connected.

      if (
        getActiveMatch(socket.id)
      ) {

        socket.emit(
          "match-error",
          {
            message:
              "You are already in a chat."
          }
        );

        return;
      }


      removeFromWaiting(
        socket.id
      );


      // ================================
      // GUEST LIMIT
      // ================================

      if (currentUser.isGuest) {

        if (
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
      }


      // ================================
      // FIND WAITING PARTNER
      // ================================

      let partnerIndex = -1;


      for (
        let index = 0;
        index < waitingUsers.length;
        index++
      ) {

        const waitingUser =
          waitingUsers[index];


        if (
          !waitingUser ||
          waitingUser.socketId === socket.id
        ) {
          continue;
        }


        const partnerSocket =
          getSocketById(
            waitingUser.socketId
          );


        if (!partnerSocket) {
          continue;
        }


        const partnerData =
          socketUsers.get(
            waitingUser.socketId
          );


        if (!partnerData) {
          continue;
        }


        if (
          !canUserAccess(
            partnerData.userId
          )
        ) {
          continue;
        }


        if (
          partnerData.isGuest &&
          !canGuestStartMatch(
            partnerData.userId
          )
        ) {
          continue;
        }


        partnerIndex = index;

        break;
      }


      // ================================
      // NO PARTNER
      // ================================

      if (partnerIndex === -1) {

        waitingUsers.push({
          socketId: socket.id,
          userId: currentUser.userId,
          isGuest: currentUser.isGuest,
          joinedAt: Date.now()
        });


        socket.emit(
          "waiting-for-user",
          {
            message:
              "Waiting for someone new..."
          }
        );

        return;
      }


      // ================================
      // CREATE MATCH
      // ================================

      const partner =
        waitingUsers.splice(
          partnerIndex,
          1
        )[0];


      const partnerData =
        socketUsers.get(
          partner.socketId
        );


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
          partnerData.userId,

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


      // Count a guest match on server.
      // This is the real guest limit tracker.

      if (currentUser.isGuest) {
        recordGuestMatch(
          currentUser.userId
        );
      }


      if (partnerData.isGuest) {
        recordGuestMatch(
          partnerData.userId
        );
      }


      const socketA =
        getSocketById(
          match.userA
        );

      const socketB =
        getSocketById(
          match.userB
        );


      if (!socketA || !socketB) {

        activeMatches.delete(
          matchId
        );

        return;
      }


      socketA.emit(
        "match-found",
        {
          matchId,
          partnerId:
            match.userBId,
          initiator: true
        }
      );


      socketB.emit(
        "match-found",
        {
          matchId,
          partnerId:
            match.userAId,
          initiator: false
        }
      );
    }
  );


  // ================================
  // WEBRTC CONNECTED
  // ================================

  socket.on(
    "webrtc-connected",
    () => {

      const match =
        getActiveMatch(
          socket.id
        );

      if (!match) {
        return;
      }


      if (!match.connectedAt) {

        match.connectedAt =
          new Date();

        match.status =
          "connected";
      }
    }
  );


  // ================================
  // WEBRTC OFFER
  // ================================

  socket.on(
    "webrtc-offer",
    (data = {}) => {

      const {
        matchId,
        offer
      } = data;


      if (!matchId || !offer) {
        return;
      }


      const match =
        activeMatches.get(
          matchId
        );


      if (
        !match ||
        !isValidPartner(
          socket.id,
          getPartnerSocketId(
            match,
            socket.id
          )
        )
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


  // ================================
  // WEBRTC ANSWER
  // ================================

  socket.on(
    "webrtc-answer",
    (data = {}) => {

      const {
        matchId,
        answer
      } = data;


      if (!matchId || !answer) {
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
        !isValidPartner(
          socket.id,
          getPartnerSocketId(
            match,
            socket.id
          )
        )
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


  // ================================
  // ICE CANDIDATE
  // ================================

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
        !isValidPartner(
          socket.id,
          getPartnerSocketId(
            match,
            socket.id
          )
        )
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


  // ================================
  // NEXT USER
  // ================================

  socket.on(
    "next-user",
    () => {

      endMatchForSocket(
        socket.id,
        "next-user"
      );

      socket.emit(
        "ready-for-next-user"
      );
    }
  );


  // ================================
  // END CHAT
  // ================================

  socket.on(
    "end-chat",
    () => {

      endMatchForSocket(
        socket.id,
        "user-ended-chat"
      );

      removeFromWaiting(
        socket.id
      );
    }
  );


  // ================================
  // DISCONNECT
  // ================================

  socket.on(
    "disconnect",
    () => {

      console.log(
        `Socket disconnected: ${socket.id}`
      );


      endMatchForSocket(
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


// ================================
// START SERVER
// ================================

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
