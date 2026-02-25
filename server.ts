import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = http.createServer(app);
  
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());

  // Database setup
  const db = new sqlite3.Database(':memory:'); // In-memory for now, can be changed to file
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      score INTEGER DEFAULT 0,
      kills INTEGER DEFAULT 0,
      matchesPlayed INTEGER DEFAULT 0
    )`);
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/users", (req, res) => {
    const { id, name } = req.body;
    db.run(`INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)`, [id, name], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  app.post("/api/users/stats", (req, res) => {
    const { id, score, kills } = req.body;
    db.run(`UPDATE users SET score = score + ?, kills = kills + ?, matchesPlayed = matchesPlayed + 1 WHERE id = ?`, [score, kills, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  app.get("/api/leaderboard", (req, res) => {
    db.all(`SELECT name, score, kills, matchesPlayed FROM users ORDER BY score DESC LIMIT 10`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // Multiplayer Socket Logic
  const players = new Map();
  const rooms = new Map(); // id -> Room object

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("createRoom", (data, callback) => {
      const roomId = data.roomId || Math.random().toString(36).substring(2, 8).toUpperCase();
      const room = {
        id: roomId,
        name: data.name || `Room ${roomId}`,
        isPrivate: data.isPrivate || false,
        password: data.password || "",
        maxPlayers: data.maxPlayers || 10,
        players: new Map(),
        hostId: socket.id,
        state: 'WAITING'
      };
      rooms.set(roomId, room);
      
      socket.join(roomId);
      room.players.set(socket.id, {
        id: socket.id,
        name: data.playerName,
        carType: data.carType || 0,
        skinIndex: data.skinIndex || 0,
        teamId: 1,
        isHost: true,
        isReady: false
      });
      
      players.set(socket.id, { roomId });
      
      if (callback) callback({ success: true, roomId, room: getRoomData(room) });
      broadcastRooms();
    });

    socket.on("joinRoom", (data, callback) => {
      const room = rooms.get(data.roomId);
      if (!room) {
        if (callback) callback({ success: false, message: "Room not found" });
        return;
      }
      
      if (room.isPrivate && room.password !== data.password) {
        if (callback) callback({ success: false, message: "Incorrect password" });
        return;
      }
      
      if (room.players.size >= room.maxPlayers) {
        if (callback) callback({ success: false, message: "Room is full" });
        return;
      }
      
      if (room.state === 'PLAYING' && room.id !== 'GLOBAL_ARENA') {
        if (callback) callback({ success: false, message: "Game already started" });
        return;
      }

      socket.join(room.id);
      const newPlayer = {
        id: socket.id,
        name: data.playerName,
        carType: data.carType || 0,
        skinIndex: data.skinIndex || 0,
        teamId: room.players.size + 1, // Simple team assignment
        isHost: false,
        isReady: false
      };
      room.players.set(socket.id, newPlayer);
      players.set(socket.id, { roomId: room.id });
      
      io.to(room.id).emit("roomUpdated", getRoomData(room));
      if (callback) callback({ success: true, roomId: room.id, room: getRoomData(room) });
      broadcastRooms();
    });

    socket.on("leaveRoom", () => {
      handleLeaveRoom(socket);
    });

    socket.on("getRooms", (callback) => {
      if (callback) callback(getPublicRooms());
    });

    socket.on("toggleReady", () => {
      const pData = players.get(socket.id);
      if (pData && pData.roomId) {
        const room = rooms.get(pData.roomId);
        if (room) {
          const player = room.players.get(socket.id);
          if (player) {
            player.isReady = !player.isReady;
            io.to(room.id).emit("roomUpdated", getRoomData(room));
          }
        }
      }
    });

    socket.on("startGame", () => {
      const pData = players.get(socket.id);
      if (pData && pData.roomId) {
        const room = rooms.get(pData.roomId);
        if (room && room.hostId === socket.id) {
          room.state = 'PLAYING';
          io.to(room.id).emit("gameStarted", getRoomData(room));
          broadcastRooms();
        }
      }
    });

    socket.on("updatePosition", (data) => {
      const pData = players.get(socket.id);
      if (pData && pData.roomId) {
        // Broadcast to others in the room
        socket.to(pData.roomId).emit("playerMoved", { ...data, id: socket.id });
      }
    });

    socket.on("shoot", (data) => {
      const pData = players.get(socket.id);
      if (pData && pData.roomId) {
        socket.to(pData.roomId).emit("playerShot", { ...data, ownerId: socket.id });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      handleLeaveRoom(socket);
    });

    function handleLeaveRoom(socket) {
      const pData = players.get(socket.id);
      if (pData && pData.roomId) {
        const room = rooms.get(pData.roomId);
        if (room) {
          room.players.delete(socket.id);
          socket.leave(room.id);
          
          if (room.players.size === 0) {
            rooms.delete(room.id);
          } else if (room.hostId === socket.id) {
            // Assign new host
            const newHostId = Array.from(room.players.keys())[0];
            room.hostId = newHostId;
            const newHost = room.players.get(newHostId);
            if (newHost) newHost.isHost = true;
            io.to(room.id).emit("roomUpdated", getRoomData(room));
          } else {
            io.to(room.id).emit("roomUpdated", getRoomData(room));
          }
          broadcastRooms();
        }
        players.delete(socket.id);
      }
    }

    function getRoomData(room) {
      return {
        id: room.id,
        name: room.name,
        isPrivate: room.isPrivate,
        maxPlayers: room.maxPlayers,
        hostId: room.hostId,
        state: room.state,
        players: Array.from(room.players.values())
      };
    }

    function getPublicRooms() {
      return Array.from(rooms.values())
        .filter(r => !r.isPrivate && r.state === 'WAITING')
        .map(getRoomData);
    }

    function broadcastRooms() {
      io.emit("roomsList", getPublicRooms());
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
