"use strict";

require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 5000;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:3000";


// --------------------------------------------------
// Security & Middleware
// --------------------------------------------------

app.use(
  helmet({
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true
  })
);

app.use(express.json({ limit: "100kb" }));


// --------------------------------------------------
// Basic Health Check
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "VizoChat Backend",
    status: "online"
  });
});


app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});


// --------------------------------------------------
// Socket.IO
// --------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true
  }
});


// Waiting users
const waitingUsers = [];


// Active matches
const activeMatches = new Map();


// --------------------------------------------------
// Helper: Remove user from waiting queue
// --------------------------------------------------

function removeFromWaitingQueue(socketId) {

  const index = waitingUsers.indexOf(socketId);

  if (index !== -1) {
    waitingUsers.splice(index, 1);
  }
}


// --------------------------------------------------
// Helper: Find available user
// --------------------------------------------------

function findWaitingUser(currentSocketId) {

  while (waitingUsers.length > 0) {

    const candidateId =
      waitingUsers.shift();

    if (
      candidateId &&
      candidateId !== currentSocketId &&
      io.sockets.sockets.has(candidateId)
    ) {
      return candidateId;
    }
  }

  return null;
}


// --------------------------------------------------
// Helper: Create match
// --------------------------------------------------

function createMatch(socketA, socketB) {

  const matchId =
    `${socketA.id}-${socketB.id}-${Date.now()}`;

  activeMatches.set(
    matchId,
    {
      matchId,
      users: [
        socketA.id,
        socketB.id
      ],
      createdAt: Date.now()
    }
  );

  socketA.join(matchId);
  socketB.join(matchId);

  socketA.data.matchId = matchId;
  socketB.data.matchId = matchId;

  socketA.data.peerId = socketB.id;
  socketB.data.peerId = socketA.id;


  socketA.emit("match-found", {
    matchId,
    peerId: socketB.id,
    initiator: true
  });


  socketB.emit("match-found", {
    matchId,
    peerId: socketA.id,
    initiator: false
  });


  console.log(
    `Match created: ${matchId}`
  );
}


// --------------------------------------------------
// Socket Connection
// --------------------------------------------------

io.on("connection", (socket) => {

  console.log(
    `User connected: ${socket.id}`
  );


  // ------------------------------------------------
  // Start random matching
  // ------------------------------------------------

  socket.on("find-match", () => {

    if (socket.data.matchId) {
      return;
    }


    removeFromWaitingQueue(
      socket.id
    );


    const waitingUser =
      findWaitingUser(socket.id);


    if (!waitingUser) {

      waitingUsers.push(
        socket.id
      );

      socket.emit(
        "waiting-for-match"
      );

      return;
    }


    const otherSocket =
      io.sockets.sockets.get(
        waitingUser
      );


    if (!otherSocket) {

      waitingUsers.push(
        socket.id
      );

      socket.emit(
        "waiting-for-match"
      );

      return;
    }


    createMatch(
      otherSocket,
      socket
    );

  });


  // ------------------------------------------------
  // WebRTC Signaling
  // ------------------------------------------------

  socket.on("webrtc-offer", (data) => {

    const peerId =
      socket.data.peerId;

    if (!peerId || !data) {
      return;
    }


    io.to(peerId).emit(
      "webrtc-offer",
      {
        from: socket.id,
        offer: data.offer
      }
    );

  });


  socket.on("webrtc-answer", (data) => {

    const peerId =
      socket.data.peerId;

    if (!peerId || !data) {
      return;
    }


    io.to(peerId).emit(
      "webrtc-answer",
      {
        from: socket.id,
        answer: data.answer
      }
    );

  });


  socket.on("webrtc-ice-candidate", (data) => {

    const peerId =
      socket.data.peerId;

    if (!peerId || !data) {
      return;
    }


    io.to(peerId).emit(
      "webrtc-ice-candidate",
      {
        from: socket.id,
        candidate: data.candidate
      }
    );

  });


  // ------------------------------------------------
  // End current match
  // ------------------------------------------------

  socket.on("next-user", () => {

    endMatchForSocket(
      socket
    );

    socket.emit(
      "match-ended"
    );

  });


  // ------------------------------------------------
  // Disconnect
  // ------------------------------------------------

  socket.on("disconnect", () => {

    console.log(
      `User disconnected: ${socket.id}`
    );


    removeFromWaitingQueue(
      socket.id
    );


    endMatchForSocket(
      socket
    );

  });

});


// --------------------------------------------------
// End Match Helper
// --------------------------------------------------

function endMatchForSocket(socket) {

  const matchId =
    socket.data.matchId;

  const peerId =
    socket.data.peerId;


  if (peerId) {

    io.to(peerId).emit(
      "peer-disconnected"
    );

  }


  if (matchId) {

    activeMatches.delete(
      matchId
    );

  }


  socket.data.matchId = null;
  socket.data.peerId = null;

}


// --------------------------------------------------
// Error Handler
// --------------------------------------------------

app.use(
  (err, req, res, next) => {

    console.error(err);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }
);


// --------------------------------------------------
// Start Server
// --------------------------------------------------

server.listen(
  PORT,
  () => {

    console.log(
      `VizoChat server running on port ${PORT}`
    );

  }
);
