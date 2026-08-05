import { Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { RoomManager } from '../domain/RoomManager';
import { Participant } from '../domain/Participant';
import { recordParticipantJoin, recordParticipantLeave } from '../db/roomRepository';
import { persist } from '../db/persist';

interface SocketData {
  roomCode?: string;
  userId?: string;
}

export function registerRoomHandlers(socket: Socket, roomManager: RoomManager): void {
  const data = socket.data as SocketData;

  socket.on('join_room', ({ roomId, username }: { roomId: string; username: string }, ack?: (res: any) => void) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      ack?.({ error: 'Room not found' });
      return;
    }

    const userId = nanoid(10);
    const participant = new Participant(userId, username, socket.id);
    room.addParticipant(participant);

    data.roomCode = room.code;
    data.userId = userId;

    socket.join(room.code);

    ack?.({ ...room.toState(), you: participant.toSummary() });

    socket.to(room.code).emit('user_joined', {
      username: participant.username,
      userId: participant.userId,
      role: participant.role,
      participants: room.getParticipants().map((p) => p.toSummary()),
    });

    persist(recordParticipantJoin(room.code, userId, participant.username, participant.role));
  });

  socket.on('leave_room', () => {
    leaveCurrentRoom(socket, roomManager);
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket, roomManager);
  });
}

function leaveCurrentRoom(socket: Socket, roomManager: RoomManager): void {
  const data = socket.data as SocketData;
  if (!data.roomCode || !data.userId) return;

  const room = roomManager.getRoom(data.roomCode);
  if (!room) return;

  const wasHost = data.userId === room.hostId;
  const removed = room.removeParticipant(data.userId);
  socket.leave(room.code);

  persist(recordParticipantLeave(room.code, data.userId));

  if (removed) {
    room.broadcast('user_left', {
      username: removed.username,
      userId: removed.userId,
      participants: room.getParticipants().map((p) => p.toSummary()),
    });
  }

  if (room.participantCount === 0) {
    roomManager.deleteIfEmpty(room.code);
  } else if (wasHost && room.hostId) {
    const newHost = room.getParticipant(room.hostId);
    if (newHost) {
      room.broadcast('role_assigned', {
        userId: newHost.userId,
        username: newHost.username,
        role: newHost.role,
        participants: room.getParticipants().map((p) => p.toSummary()),
      });
    }
  }

  data.roomCode = undefined;
  data.userId = undefined;
}
