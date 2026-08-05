import { Server } from 'socket.io';
import { Participant } from './Participant';
import { PlayState, RoomState, Role } from '../types';

export class Room {
  public hostId: string | null = null;
  public videoId: string | null = null;
  // Position (seconds) as of the last checkpoint (play/pause/seek/change video) —
  // NOT the live position while playing. Use getLiveCurrentTime() for that.
  public currentTime = 0;
  public playState: PlayState = 'paused';
  // Wall-clock ms when playback last started; null while paused. Lets us
  // extrapolate the live position without any client reporting it or any
  // periodic heartbeat traffic — see getLiveCurrentTime().
  private playStartedAt: number | null = null;
  private participants = new Map<string, Participant>();

  constructor(
    public readonly roomId: string,
    public readonly code: string,
    private io: Server,
  ) {}

  addParticipant(participant: Participant): void {
    if (this.participants.size === 0 && !this.hostId) {
      participant.role = 'host';
      this.hostId = participant.userId;
    }
    this.participants.set(participant.userId, participant);
  }

  removeParticipant(userId: string): Participant | undefined {
    const participant = this.participants.get(userId);
    this.participants.delete(userId);

    if (userId === this.hostId) {
      this.hostId = null;
      const next = this.participants.values().next().value as Participant | undefined;
      if (next) {
        next.role = 'host';
        this.hostId = next.userId;
      }
    }

    return participant;
  }

  getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  findBySocketId(socketId: string): Participant | undefined {
    return [...this.participants.values()].find((p) => p.socketId === socketId);
  }

  getParticipants(): Participant[] {
    return [...this.participants.values()];
  }

  get participantCount(): number {
    return this.participants.size;
  }

  play(): void {
    if (this.playState !== 'playing') {
      this.playStartedAt = Date.now();
      this.playState = 'playing';
    }
  }

  pause(): void {
    if (this.playState === 'playing') {
      this.currentTime = this.getLiveCurrentTime();
      this.playStartedAt = null;
      this.playState = 'paused';
    }
  }

  seek(time: number): void {
    this.currentTime = time;
    // Still playing through a seek — restart the extrapolation checkpoint
    // from the new position instead of the old one.
    if (this.playState === 'playing') {
      this.playStartedAt = Date.now();
    }
  }

  changeVideo(videoId: string): void {
    this.videoId = videoId;
    this.currentTime = 0;
    this.playStartedAt = null;
    this.playState = 'paused';
  }

  // The actual current playback position right now, accounting for time
  // elapsed since play() was called. Without this, a client that joins (or
  // any sync_state read) after the video has been playing for a while would
  // see the stale checkpoint from the last seek/play — landing far behind
  // where everyone else already is.
  getLiveCurrentTime(): number {
    if (this.playState === 'playing' && this.playStartedAt !== null) {
      return this.currentTime + (Date.now() - this.playStartedAt) / 1000;
    }
    return this.currentTime;
  }

  // Raw override used only when rehydrating room state from Postgres on
  // server boot — no live participants exist yet at that point, so there's
  // no "elapsed since play" to account for.
  restoreState(partial: { videoId?: string | null; currentTime?: number; playState?: PlayState }): void {
    if (partial.videoId !== undefined) this.videoId = partial.videoId;
    if (partial.currentTime !== undefined) this.currentTime = partial.currentTime;
    this.playState = 'paused';
    this.playStartedAt = null;
  }

  assignRole(userId: string, role: Role): Participant | undefined {
    const participant = this.participants.get(userId);
    if (!participant) return undefined;
    participant.role = role;
    return participant;
  }

  broadcast(event: string, payload: unknown): void {
    this.io.to(this.code).emit(event, payload);
  }

  emitTo(socketId: string, event: string, payload: unknown): void {
    this.io.to(socketId).emit(event, payload);
  }

  toState(): RoomState {
    return {
      roomId: this.roomId,
      code: this.code,
      videoId: this.videoId,
      currentTime: this.getLiveCurrentTime(),
      playState: this.playState,
      participants: this.getParticipants().map((p) => p.toSummary()),
    };
  }
}
