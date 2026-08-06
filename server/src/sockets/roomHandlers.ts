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

// How long a participant's identity (userId + role, host included) is held
// after their socket drops before we actually remove them and reassign host.
// This turns a transient network blip or brief tab suspension into a no-op
// instead of kicking the user out and flapping the host role. An explicit
// "Leave" (leave_room) still removes immediately.
const RECONNECT_GRACE_MS = 15000;

// Pending grace-period removals, keyed by `${roomCode}:${userId}`, so a
// reconnect of the same identity can cancel the scheduled removal.
const pendingRemovals = new Map<string, NodeJS.Timeout>();

function removalKey(roomCode: string, userId: string): string {
  return `${roomCode}:${userId}`;
}

function cancelPendingRemoval(roomCode: string, userId: string): void {
  const key = removalKey(roomCode, userId);
  const timer = pendingRemovals.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingRemovals.delete(key);
  }
}

export function registerRoomHandlers(socket: Socket, roomManager: RoomManager): void {
  const data = socket.data as SocketData;

  socket.on(
    'join_room',
    (
      { roomId, username, userId }: { roomId: string; username: string; userId?: string },
      ack?: (res: any) => void,
    ) => {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        ack?.({ error: 'Room not found' });
        return;
      }

      // Reconnect path: the client sent back a userId it was previously
      // assigned and that participant is still present (its grace timer hasn't
      // fired). Re-attach the new socket to the existing identity — role
      // preserved, no new participant, no host reassignment, and other clients
      // never saw a leave to broadcast.
      const existing = userId ? room.getParticipant(userId) : undefined;
      if (existing) {
        cancelPendingRemoval(room.code, existing.userId);
        existing.socketId = socket.id;
        existing.connected = true;

        data.roomCode = room.code;
        data.userId = existing.userId;
        socket.join(room.code);

        ack?.({ ...room.toState(), you: existing.toSummary() });
        return;
      }

      // New participant.
      const newUserId = nanoid(10);
      const participant = new Participant(newUserId, username, socket.id);
      room.addParticipant(participant);

      data.roomCode = room.code;
      data.userId = newUserId;
      socket.join(room.code);

      ack?.({ ...room.toState(), you: participant.toSummary() });

      socket.to(room.code).emit('user_joined', {
        username: participant.username,
        userId: participant.userId,
        role: participant.role,
        participants: room.getParticipants().map((p) => p.toSummary()),
      });

      persist(recordParticipantJoin(room.code, newUserId, participant.username, participant.role));
    },
  );

  socket.on('leave_room', () => {
    // Explicit, intentional leave — remove now, skip the grace period.
    const { roomCode, userId } = data;
    if (!roomCode || !userId) return;

    cancelPendingRemoval(roomCode, userId);
    finalizeLeave(roomManager, roomCode, userId);
    socket.leave(roomCode);

    data.roomCode = undefined;
    data.userId = undefined;
  });

  socket.on('disconnect', () => {
    const { roomCode, userId } = data;
    if (!roomCode || !userId) return;

    const room = roomManager.getRoom(roomCode);
    const participant = room?.getParticipant(userId);
    if (!room || !participant) return;

    // If a newer socket already re-attached this identity (reconnect raced
    // ahead of this disconnect), this event is for the stale socket — ignore.
    if (participant.socketId !== socket.id) return;

    participant.connected = false;

    // Hold the identity briefly; only actually remove if no reconnect arrives.
    cancelPendingRemoval(roomCode, userId);
    const timer = setTimeout(() => {
      pendingRemovals.delete(removalKey(roomCode, userId));
      const current = roomManager.getRoom(roomCode)?.getParticipant(userId);
      // A reconnect would have flipped connected back to true and cleared this
      // timer; the guard covers any lingering edge case.
      if (current && !current.connected) {
        finalizeLeave(roomManager, roomCode, userId);
      }
    }, RECONNECT_GRACE_MS);
    pendingRemovals.set(removalKey(roomCode, userId), timer);
  });
}

// Removes a participant from the live room, reassigns host if needed, tells the
// room, persists the leave, and evicts the room if it is now empty. Kept
// socket-independent so it can run from either an explicit leave or a
// grace-timer expiry (where the original socket is already gone).
function finalizeLeave(roomManager: RoomManager, roomCode: string, userId: string): void {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  const wasHost = userId === room.hostId;
  const removed = room.removeParticipant(userId);
  if (!removed) return;

  persist(recordParticipantLeave(roomCode, userId));

  room.broadcast('user_left', {
    username: removed.username,
    userId: removed.userId,
    participants: room.getParticipants().map((p) => p.toSummary()),
  });

  if (room.participantCount === 0) {
    roomManager.deleteIfEmpty(roomCode);
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
}
