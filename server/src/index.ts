import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import { RoomManager } from "./domain/RoomManager";
import { roomsRouter } from "./routes/rooms";
import { registerRoomHandlers } from "./sockets/roomHandlers";
import { registerPlaybackHandlers } from "./sockets/playbackHandlers";
import { registerRoleHandlers } from "./sockets/roleHandlers";

const app = express();
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
}));

app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  },
});

const roomManager = new RoomManager(io);

// REST API
app.use("/api/rooms", roomsRouter(roomManager));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Socket Connection
io.on("connection", (socket) => {

console.log("User Connected:", socket.id);
console.log("Socket Data:", socket.data);
  registerRoomHandlers(socket, roomManager);
  registerPlaybackHandlers(socket, roomManager);
  registerRoleHandlers(socket, roomManager);

  socket.on("disconnect", () => {
    console.log("User Disconnected:", socket.id);
  });
});

// Load existing rooms from database
roomManager.rehydrate().finally(() => {
  const PORT = process.env.PORT || 5000;

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});