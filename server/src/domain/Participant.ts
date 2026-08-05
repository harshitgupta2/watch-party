import { ParticipantSummary, PermissionAction, PLAYBACK_ACTIONS, ROLE_MANAGEMENT_ACTIONS, Role } from '../types';

const PLAYBACK_ROLES: Role[] = ['host', 'moderator'];
const ROLE_MANAGEMENT_ROLES: Role[] = ['host'];

export class Participant {
  public socketId: string;

  constructor(
    public readonly userId: string,
    public username: string,
    socketId: string,
    public role: Role = 'participant',
  ) {
    this.socketId = socketId;
  }

  hasPermission(action: PermissionAction): boolean {
    if ((PLAYBACK_ACTIONS as readonly string[]).includes(action)) {
      return PLAYBACK_ROLES.includes(this.role);
    }
    if ((ROLE_MANAGEMENT_ACTIONS as readonly string[]).includes(action)) {
      return ROLE_MANAGEMENT_ROLES.includes(this.role);
    }
    return false;
  }

  toSummary(): ParticipantSummary {
    return { userId: this.userId, username: this.username, role: this.role };
  }
}
