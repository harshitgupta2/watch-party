import type { RoomState } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;

export async function createRoom(): Promise<{ roomId: string; code: string }> {
  const res = await fetch(`${SERVER_URL}/api/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create room');
  return res.json();
}

export async function fetchRoom(code: string): Promise<RoomState> {
  const res = await fetch(`${SERVER_URL}/api/rooms/${code}`);
  if (!res.ok) throw new Error('Room not found');
  return res.json();
}
