import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './domain/RoomManager';
import { roomsRouter } from './routes/rooms';
import { registerRoomHandlers } from './sockets/roomHandlers';
import { registerPlaybackHandlers } from './sockets/playbackHandlers';
import { registerRoleHandlers } from './sockets/roleHandlers';


const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Vite bumps to 5174, 5175, ... whenever 5173 is already taken (common in
// dev when an old server didn't shut down cleanly), which would otherwise
// require editing CLIENT_ORIGIN by hand every time. In production only the
// exact configured CLIENT_ORIGIN is trusted.
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser clients (curl, server-to-server) send no Origin header
  if (origin === CLIENT_ORIGIN) return true;
  if (NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    callback(null, isAllowedOrigin(origin));
  },
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());


const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
});

const roomManager = new RoomManager(io);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/rooms', roomsRouter(roomManager));


io.on('connection', (socket) => {
  registerRoomHandlers(socket, roomManager);
  registerPlaybackHandlers(socket, roomManager);
  registerRoleHandlers(socket, roomManager);
});

roomManager
  .rehydrate()
  .catch((err) => console.error('Failed to rehydrate rooms from Postgres:', err))
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  });
