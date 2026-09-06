"use strict";

require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const routes = require("./routes");

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
    methods: ["GET", "POST"]
  }
});

// Waiting users
const waitingUsers = [];

// Active matches
const activeMatches = new Map();

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

// End current match
function endMatchForSocket(socketId, reason = "ended") {
  const match = activeMatches.get(socketId);

  if (!match) {
    return;
  }

  const otherSocketId =
    match.userA === socketId
      ? match.userB
      : match.userA;

  activeMatches.delete(socketId);
  activeMatches.delete(otherSocketId);

  const otherSocket = getSocketById(otherSocketId);

  if (otherSocket) {
    otherSocket.emit("partner-left", {
      reason
    });
  }
}

// Socket connection
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Find random user
  socket.on("find-random-user", () => {
    removeFromWaiting(socket.id);

    let partnerId = null;

    for (const waitingId of waitingUsers) {
      if (
        waitingId !== socket.id &&
        getSocketById(waitingId)
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

    // Create match ID
    const matchId =
      `match_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    const match = {
      matchId,
      userA: socket.id,
      userB: partnerId,
      startedAt: new Date()
    };

    activeMatches.set(socket.id, match);
    activeMatches.set(partnerId, match);

    // Tell first user to create offer
    socket.emit("match-found", {
      matchId,
      role: "caller",
      partnerId
    });

    // Tell second user to wait for offer
    partnerSocket.emit("match-found", {
      matchId,
      role: "receiver",
      partnerId: socket.id
    });

    console.log(
      `Match created: ${socket.id} <-> ${partnerId}`
    );
  });

  // WebRTC Offer
  socket.on("webrtc-offer", ({ offer, partnerId }) => {
    if (!offer || !partnerId) {
      return;
    }

    const partnerSocket = getSocketById(partnerId);

    if (!partnerSocket) {
      return;
    }

    partnerSocket.emit("webrtc-offer", {
      offer,
      senderId: socket.id
    });
  });

  // WebRTC Answer
  socket.on("webrtc-answer", ({ answer, partnerId }) => {
    if (!answer || !partnerId) {
      return;
    }

    const partnerSocket = getSocketById(partnerId);

    if (!partnerSocket) {
      return;
    }

    partnerSocket.emit("webrtc-answer", {
      answer,
      senderId: socket.id
    });
  });

  // ICE Candidate
  socket.on(
    "webrtc-ice-candidate",
    ({ candidate, partnerId }) => {
      if (!candidate || !partnerId) {
        return;
      }

      const partnerSocket = getSocketById(partnerId);

      if (!partnerSocket) {
        return;
      }

      partnerSocket.emit("webrtc-ice-candidate", {
        candidate,
        senderId: socket.id
      });
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
  });
});

// Start server
server.listen(PORT, () => {
  console.log("----------------------------------------");
  console.log("VizoChat Backend");
  console.log(`Server running on port ${PORT}`);
  console.log(
    `Environment: ${process.env.NODE_ENV || "development"}`
  );
  console.log("----------------------------------------");
});
