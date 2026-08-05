import { Socket } from 'socket.io';
import { RoomManager } from '../domain/RoomManager';
import { Room } from '../domain/Room';
import { updatePlaybackState as persistPlaybackState } from '../db/roomRepository';
import { persist } from '../db/persist';

interface SocketData {
  roomCode?: string;
  userId?: string;
}

function getContext(socket: Socket, roomManager: RoomManager) {
  const data = socket.data as SocketData;
  if (!data.roomCode || !data.userId) return null;

  const room = roomManager.getRoom(data.roomCode);
  if (!room) return null;

  const participant = room.getParticipant(data.userId);
  if (!participant) return null;

  return { room, participant };
}

function broadcastAndPersist(room: Room): void {
  const currentTime = room.getLiveCurrentTime();
  room.broadcast('sync_state', {
    playState: room.playState,
    currentTime,
    videoId: room.videoId,
  });
  persist(persistPlaybackState(room.code, room.videoId, currentTime, room.playState));
}

export function registerPlaybackHandlers(socket: Socket, roomManager: RoomManager): void {
  socket.on('play', () => {
    const ctx = getContext(socket, roomManager);
    if (!ctx || !ctx.participant.hasPermission('play')) return;

    ctx.room.play();
    broadcastAndPersist(ctx.room);
  });

  socket.on('pause', () => {
    const ctx = getContext(socket, roomManager);
    if (!ctx || !ctx.participant.hasPermission('pause')) return;

    ctx.room.pause();
    broadcastAndPersist(ctx.room);
  });

  socket.on('seek', ({ time }: { time: number }) => {
    const ctx = getContext(socket, roomManager);
    if (!ctx || !ctx.participant.hasPermission('seek')) return;
    if (typeof time !== 'number' || Number.isNaN(time) || time < 0) return;

    ctx.room.seek(time);
    broadcastAndPersist(ctx.room);
  });

  socket.on('change_video', ({ videoId }: { videoId: string }) => {
    const ctx = getContext(socket, roomManager);
    if (!ctx || !ctx.participant.hasPermission('change_video')) return;
    if (typeof videoId !== 'string' || !videoId.trim()) return;

    ctx.room.changeVideo(videoId);
    broadcastAndPersist(ctx.room);
  });
}
