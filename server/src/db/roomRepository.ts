import { pool } from './pool';
import { PlayState, Role } from '../types';

export interface PersistedRoom {
  code: string;
  videoId: string | null;
  currentTime: number;
  playState: PlayState;
}

export async function insertRoom(code: string): Promise<void> {
  await pool.query(`INSERT INTO rooms (code) VALUES ($1) ON CONFLICT (code) DO NOTHING`, [code]);
}

export async function updatePlaybackState(
  code: string,
  videoId: string | null,
  currentTime: number,
  playState: PlayState,
): Promise<void> {
  await pool.query(
    `UPDATE rooms SET video_id = $2, current_time_seconds = $3, play_state = $4, updated_at = now() WHERE code = $1`,
    [code, videoId, currentTime, playState],
  );
}

export async function loadAllRooms(): Promise<PersistedRoom[]> {
  const { rows } = await pool.query(
    `SELECT code, video_id, current_time_seconds, play_state FROM rooms`,
  );
  return rows.map((r) => ({
    code: r.code,
    videoId: r.video_id,
    currentTime: Number(r.current_time_seconds),
    playState: r.play_state as PlayState,
  }));
}

export async function deleteRoom(code: string): Promise<void> {
  await pool.query(`DELETE FROM rooms WHERE code = $1`, [code]);
}

export async function recordParticipantJoin(
  roomCode: string,
  userId: string,
  username: string,
  role: Role,
): Promise<void> {
  await pool.query(
    `INSERT INTO participant_sessions (room_code, user_id, username, role) VALUES ($1, $2, $3, $4)`,
    [roomCode, userId, username, role],
  );
}

export async function recordParticipantLeave(roomCode: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE participant_sessions SET left_at = now()
     WHERE room_code = $1 AND user_id = $2 AND left_at IS NULL`,
    [roomCode, userId],
  );
}
