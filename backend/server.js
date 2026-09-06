"use strict";

require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const routes = require("./routes");
const {
  canGuestStartMatch,
  recordGuestMatch
} = require("./services/guestService");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";

// Security
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

// CORS
app.use(
  cors({
    origin: FRONTEND_URL === "*" ? true : FRONTEND_URL,
    credentials: true
  })
);

// Body parser
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Home
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "VizoChat Backend",
    status: "online"
  });
});

// API routes
app.use("/api", routes);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL === "*" ? "*" : FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Waiting users
const waitingUsers = [];

// Active matches
const activeMatches = new Map();

// Socket user information
const socketUsers = new Map();

// Remove user from waiting list
function removeFromWaiting(socketId) {
  const index = waitingUsers.indexOf(socketId);

  if (index !== -1) {
    waitingUsers.splice(index, 1);
  }
}

// Get socket
function getSocketById(socketId) {
  return io.sockets.sockets.get(socketId);
}

// Get active match
function getActiveMatch(socketId) {
  return activeMatches.get(socketId) || null;
}

// Check whether two sockets belong to the same match
function isValidPartner(socketId, partnerId) {
  const match = getActiveMatch(socketId);

  if (!match) {
    return false;
  }

  return (
    (match.userA === socketId && match.userB === partnerId) ||
    (match.userB === socketId && match.userA === partnerId)
  );
}

// End current match
function endMatchForSocket(socketId, reason = "ended") {
  const match = getActiveMatch(socketId);

  if (!match) {
    return null;
  }

  const otherSocketId =
    match.userA === socketId
      ? match.userB
      : match.userA;

  activeMatches.delete(match.userA);
  activeMatches.delete(match.userB);

  const otherSocket = getSocketById(otherSocketId);

  if (otherSocket) {
    otherSocket.emit("partner-left", {
      matchId: match.matchId,
      reason
    });
  }

  return match;
}

// Socket connection
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  /*
   * Optional client information.
   *
   * Frontend can send:
   * {
   *   userId: "...",
   *   isGuest: true
   * }
   *
   * Existing frontend without this data will still work.
   */
  socket.on("register-user", (data = {}) => {
    const userId =
      typeof data.userId === "string" && data.userId.trim()
        ? data.userId.trim()
        : null;

    const isGuest = data.isGuest === true;

    socketUsers.set(socket.id, {
      userId,
      isGuest
    });

    socket.emit("user-registered", {
      success: true,
      userId,
      isGuest
    });
  });

  // Find random user
  socket.on("find-random-user", (data = {}) => {
    // Do not allow a socket already in an active match
    if (getActiveMatch(socket.id)) {
      socket.emit("match-error", {
        message: "You are already in a chat."
      });

      return;
    }

    removeFromWaiting(socket.id);

    const socketInfo = socketUsers.get(socket.id) || {
      userId:
        typeof data.userId === "string"
          ? data.userId
          : null,
      isGuest: data.isGuest === true
    };

    socketUsers.set(socket.id, socketInfo);

    // Guest match limit
    if (socketInfo.isGuest && socketInfo.userId) {
      const guestStatus = canGuestStartMatch(
        socketInfo.userId
      );

      if (!guestStatus) {
        socket.emit("guest-limit-reached", {
          success: false,
          message:
            "Guest match limit reached. Please login with Google to continue."
        });

        return;
      }
    }

    let partnerId = null;

    for (const waitingId of waitingUsers) {
      if (
        waitingId !== socket.id &&
        getSocketById(waitingId) &&
        !getActiveMatch(waitingId)
      ) {
        partnerId = waitingId;
        break;
      }
    }

    // Nobody available
    if (!partnerId) {
      waitingUsers.push(socket.id);

      socket.emit("waiting-for-match");

      return;
    }

    removeFromWaiting(partnerId);

    const partnerSocket = getSocketById(partnerId);

    if (!partnerSocket) {
      waitingUsers.push(socket.id);

      socket.emit("waiting-for-match");

      return;
    }

    const partnerInfo =
      socketUsers.get(partnerId) || {
        userId: null,
        isGuest: true
      };

    // Guest partner limit check
    if (partnerInfo.isGuest && partnerInfo.userId) {
      const partnerGuestStatus =
        canGuestStartMatch(partnerInfo.userId);

      if (!partnerGuestStatus) {
        waitingUsers.push(socket.id);

        socket.emit("waiting-for-match");

        partnerSocket.emit("guest-limit-reached", {
          success: false,
          message:
            "Guest match limit reached. Please login with Google to continue."
        });

        return;
      }
    }

    // Create match ID
    const matchId =
      `match_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    const match = {
      matchId,
      userA: socket.id,
      userB: partnerId,
      userAId: socketInfo.userId,
      userBId: partnerInfo.userId,
      startedAt: new Date(),
      connectedAt: null,
      status: "active"
    };

    activeMatches.set(socket.id, match);
    activeMatches.set(partnerId, match);

    // Record guest matches
    if (socketInfo.isGuest && socketInfo.userId) {
      recordGuestMatch(socketInfo.userId);
    }

    if (partnerInfo.isGuest && partnerInfo.userId) {
      recordGuestMatch(partnerInfo.userId);
    }

    // Tell first user to create offer
    socket.emit("match-found", {
      matchId,
      role: "caller",
      partnerId,
      partnerUserId: partnerInfo.userId
    });

    // Tell second user to wait for offer
    partnerSocket.emit("match-found", {
      matchId,
      role: "receiver",
      partnerId: socket.id,
      partnerUserId: socketInfo.userId
    });

    console.log(
      `Match created: ${socket.id} <-> ${partnerId}`
    );
  });

  // Mark WebRTC connection as established
  socket.on("webrtc-connected", ({ partnerId } = {}) => {
    if (!partnerId) {
      return;
    }

    if (!isValidPartner(socket.id, partnerId)) {
      return;
    }

    const match = getActiveMatch(socket.id);

    if (!match) {
      return;
    }

    if (!match.connectedAt) {
      match.connectedAt = new Date();
      match.status = "connected";
    }

    const partnerSocket = getSocketById(partnerId);

    if (partnerSocket) {
      partnerSocket.emit("webrtc-connected", {
        matchId: match.matchId,
        partnerId: socket.id
      });
    }
  });

  // WebRTC Offer
  socket.on(
    "webrtc-offer",
    ({ offer, partnerId } = {}) => {
      if (!offer || !partnerId) {
        return;
      }

      if (!isValidPartner(socket.id, partnerId)) {
        return;
      }

      const partnerSocket =
        getSocketById(partnerId);

      if (!partnerSocket) {
        return;
      }

      partnerSocket.emit("webrtc-offer", {
        offer,
        senderId: socket.id
      });
    }
  );

  // WebRTC Answer
  socket.on(
    "webrtc-answer",
    ({ answer, partnerId } = {}) => {
      if (!answer || !partnerId) {
        return;
      }

      if (!isValidPartner(socket.id, partnerId)) {
        return;
      }

      const partnerSocket =
        getSocketById(partnerId);

      if (!partnerSocket) {
        return;
      }

      partnerSocket.emit("webrtc-answer", {
        answer,
        senderId: socket.id
      });
    }
  );

  // ICE Candidate
  socket.on(
    "webrtc-ice-candidate",
    ({ candidate, partnerId } = {}) => {
      if (!candidate || !partnerId) {
        return;
      }

      if (!isValidPartner(socket.id, partnerId)) {
        return;
      }

      const partnerSocket =
        getSocketById(partnerId);

      if (!partnerSocket) {
        return;
      }

      partnerSocket.emit(
        "webrtc-ice-candidate",
        {
          candidate,
          senderId: socket.id
        }
      );
    }
  );

  // Next user
  socket.on("next-user", () => {
    endMatchForSocket(
      socket.id,
      "next-user"
    );

    removeFromWaiting(socket.id);

    socket.emit("ready-for-next-user");
  });

  // End chat
  socket.on("end-chat", () => {
    endMatchForSocket(
      socket.id,
      "chat-ended"
    );

    removeFromWaiting(socket.id);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(
      `Socket disconnected: ${socket.id}`
    );

    removeFromWaiting(socket.id);

    endMatchForSocket(
      socket.id,
      "disconnected"
    );

    socketUsers.delete(socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log("----------------------------------------");
  console.log("VizoChat Backend");
  console.log(`Server running on port ${PORT}`);
  console.log(
    `Environment: ${
      process.env.NODE_ENV || "development"
    }`
  );
  console.log("----------------------------------------");
});
