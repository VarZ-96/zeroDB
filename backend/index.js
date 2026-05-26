import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoute.js";
import aiRoutes from "./routes/aiRoute.js";
import dbRoutes from "./routes/dbRoute.js";
import historyRoutes from "./routes/historyRoute.js";
import shareRoutes from "./routes/shareRoute.js";
import collabRoutes from "./routes/collabRoute.js";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

connectDB();

const allowedOrigins = [
  "https://zero-db-seven.vercel.app",
  "http://localhost:5173"
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin);
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin);
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Set up express app context bindings so controllers can push real-time alerts
const userSockets = new Map(); // userId (string) -> socket.id (string)
app.set("io", io);
app.set("userSockets", userSockets);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/db", dbRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/collab", collabRoutes);

// Real-Time Socket Connection Handlers
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Register online user ID mapping
  socket.on("register-user", (userId) => {
    if (userId) {
      userSockets.set(userId.toString(), socket.id);
      socket.userId = userId.toString();
      console.log(`👤 Registered User Socket: ${userId} -> ${socket.id}`);
    }
  });

  // Join Multiplayer SQL Room
  socket.on("join-room", ({ roomId, user }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userProfile = user; // { _id, name, email, avatar }

    console.log(`🏢 Socket ${socket.id} joined Room: ${roomId}`);

    // Compile currently active users in the room
    const clients = io.sockets.adapter.rooms.get(roomId);
    const activeUsers = [];
    if (clients) {
      for (const clientId of clients) {
        const clientSocket = io.sockets.sockets.get(clientId);
        if (clientSocket && clientSocket.userProfile) {
          activeUsers.push(clientSocket.userProfile);
        }
      }
    }

    // Broadcast updated presence list
    io.to(roomId).emit("presence-update", activeUsers);
    
    // Notify peers a new member joined
    socket.to(roomId).emit("peer-joined", user);
  });

  // Synchronize dynamic code editing
  socket.on("text-change", ({ roomId, text }) => {
    socket.to(roomId).emit("text-change", { text });
  });

  // Synchronize cursor selection / movement coordinates
  socket.on("cursor-move", ({ roomId, cursor, user }) => {
    socket.to(roomId).emit("cursor-move", { cursor, user });
  });

  // Replicate database query execution across client workers
  socket.on("query-execute", ({ roomId, sql, user }) => {
    console.log(`⚡ Query executing in Room ${roomId} by ${user.name}: ${sql}`);
    socket.to(roomId).emit("query-execute", { sql, user });
  });

  // Synchronize visual loading indicator status
  socket.on("query-executing", ({ roomId, isExecuting, user }) => {
    socket.to(roomId).emit("query-executing", { isExecuting, user });
  });

  // Disconnection handler
  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    if (socket.userId) {
      userSockets.delete(socket.userId);
    }

    const roomId = socket.roomId;
    if (roomId) {
      // Re-compile remaining connected users
      const clients = io.sockets.adapter.rooms.get(roomId);
      const activeUsers = [];
      if (clients) {
        for (const clientId of clients) {
          const clientSocket = io.sockets.sockets.get(clientId);
          if (clientSocket && clientSocket.userProfile) {
            activeUsers.push(clientSocket.userProfile);
          }
        }
      }
      
      io.to(roomId).emit("presence-update", activeUsers);
      socket.to(roomId).emit("peer-left", socket.userProfile);
    }
  });
});

// Cleanup Cron Job: Runs every hour to delete files older than 24 hours
cron.schedule("0 * * * *", () => {
  const uploadsDir = path.join(__dirname, "uploads");
  if (fs.existsSync(uploadsDir)) {
    fs.readdir(uploadsDir, (err, files) => {
      if (err) return console.error("Cron read dir error:", err);
      const now = Date.now();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      files.forEach((file) => {
        const filePath = path.join(uploadsDir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return console.error("Cron stat error:", err);
          if (now - stats.mtimeMs > ONE_DAY_MS) {
            fs.unlink(filePath, (err) => {
              if (err) console.error("Cron unlink error:", err);
              else console.log(`Deleted expired file: ${file}`);
            });
          }
        });
      });
    });
  }
});

app.get("/", (req, res) => {
  res.send("SircuS API is running smoothly...");
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `Server is running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`
  );
});

