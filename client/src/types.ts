export type Role = 'host' | 'moderator' | 'participant';
export type PlayState = 'playing' | 'paused';

export interface ParticipantSummary {
  userId: string;
  username: string;
  role: Role;
}

export interface RoomState {
  roomId: string;
  code: string;
  videoId: string | null;
  currentTime: number;
  playState: PlayState;
  participants: ParticipantSummary[];
}

export interface SyncStatePayload {
  playState: PlayState;
  currentTime: number;
  videoId: string | null;
}
