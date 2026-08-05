import { Socket } from 'socket.io';
import { RoomManager } from '../domain/RoomManager';
import { Role } from '../types';

interface SocketData {
  roomCode?: string;
  userId?: string;
}

const ASSIGNABLE_ROLES: Role[] = ['moderator', 'participant'];

function getContext(socket: Socket, roomManager: RoomManager) {
  const data = socket.data as SocketData;
  if (!data.roomCode || !data.userId) return null;

  const room = roomManager.getRoom(data.roomCode);
  if (!room) return null;

  const participant = room.getParticipant(data.userId);
  if (!participant) return null;

  return { room, participant };
}

export function registerRoleHandlers(socket: Socket, roomManager: RoomManager): void {
  socket.on('assign_role', ({ userId, role }: { userId: string; role: Role }) => {
    const ctx = getContext(socket, roomManager);
    if (!ctx || !ctx.participant.hasPermission('assign_role')) return;
    if (!ASSIGNABLE_ROLES.includes(role)) return;
    if (userId === ctx.room.hostId) return;

    const target = ctx.room.assignRole(userId, role);
    if (!target) return;

    ctx.room.broadcast('role_assigned', {
      userId: target.userId,
      username: target.username,
      role: target.role,
      participants: ctx.room.getParticipants().map((p) => p.toSummary()),
    });
  });

  socket.on('remove_participant', ({ userId }: { userId: string }) => {
    const ctx = getContext(socket, roomManager);
    if (!ctx || !ctx.participant.hasPermission('remove_participant')) return;
    if (userId === ctx.room.hostId) return;

    const target = ctx.room.getParticipant(userId);
    if (!target) return;

    ctx.room.removeParticipant(userId);

    ctx.room.broadcast('participant_removed', {
      userId: target.userId,
      participants: ctx.room.getParticipants().map((p) => p.toSummary()),
    });

    ctx.room.emitTo(target.socketId, 'removed_from_room', {});
  });

  socket.on('transfer_host', ({ userId }: { userId: string }) => {
    const ctx = getContext(socket, roomManager);
    if (!ctx || !ctx.participant.hasPermission('transfer_host')) return;

    const target = ctx.room.getParticipant(userId);
    if (!target || target.userId === ctx.room.hostId) return;

    ctx.room.assignRole(ctx.participant.userId, 'participant');
    ctx.room.assignRole(target.userId, 'host');
    ctx.room.hostId = target.userId;

    ctx.room.broadcast('role_assigned', {
      userId: target.userId,
      username: target.username,
      role: 'host',
      participants: ctx.room.getParticipants().map((p) => p.toSummary()),
    });
  });
}
