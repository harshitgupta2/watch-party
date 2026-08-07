import { Server } from 'socket.io';
import { customAlphabet } from 'nanoid';
import { Room } from './Room';
import { insertRoom, loadAllRooms, PersistedRoom } from '../db/roomRepository';
import { persist } from '../db/persist';

const generateCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private io: Server) {}

  createRoom(): Room {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const room = new Room(code, code, this.io);
    this.rooms.set(code, room);
    persist(insertRoom(code));
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  deleteRoom(code: string): void {
    this.rooms.delete(code);
  }

  deleteIfEmpty(code: string): void {
    const room = this.rooms.get(code);
    if (room && room.participantCount === 0) {

      this.rooms.delete(code);
    }
  }

  // Re-populates the in-memory map from Postgres on server boot
  async rehydrate(): Promise<void> {
    const persistedRooms: PersistedRoom[] = await loadAllRooms();
    for (const row of persistedRooms) {
      if (this.rooms.has(row.code)) continue;
      const room = new Room(row.code, row.code, this.io);
      room.restoreState({
        videoId: row.videoId,
        currentTime: row.currentTime,
      });
      this.rooms.set(row.code, room);
    }
    if (persistedRooms.length > 0) {
      console.log(`Rehydrated ${persistedRooms.length} room(s) from Postgres.`);
    }
  }
}
