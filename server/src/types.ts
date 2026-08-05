export type Role = 'host' | 'moderator' | 'participant';

export type PlayState = 'playing' | 'paused';

export const PLAYBACK_ACTIONS = ['play', 'pause', 'seek', 'change_video'] as const;
export type PlaybackAction = (typeof PLAYBACK_ACTIONS)[number];

export const ROLE_MANAGEMENT_ACTIONS = ['assign_role', 'remove_participant', 'transfer_host'] as const;
export type RoleManagementAction = (typeof ROLE_MANAGEMENT_ACTIONS)[number];

export type PermissionAction = PlaybackAction | RoleManagementAction;

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
