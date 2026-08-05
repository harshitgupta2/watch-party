import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ParticipantSummary, PlayState, Role } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;

interface JoinAck {
  error?: string;
  roomId?: string;
  code?: string;
  videoId?: string | null;
  currentTime?: number;
  playState?: PlayState;
  participants?: ParticipantSummary[];
  you?: ParticipantSummary;
}

export function useRoomSocket(roomCode: string, username: string) {
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [you, setYou] = useState<ParticipantSummary | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playState, setPlayState] = useState<PlayState>('paused');

  useEffect(() => {
    if (!roomCode || !username) return;

    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_room', { roomId: roomCode, username }, (ack: JoinAck) => {
        if (ack.error) {
          setError(ack.error);
          return;
        }
        setParticipants(ack.participants ?? []);
        setYou(ack.you ?? null);
        setVideoId(ack.videoId ?? null);
        setCurrentTime(ack.currentTime ?? 0);
        setPlayState(ack.playState ?? 'paused');
      });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('sync_state', (payload: { playState: PlayState; currentTime: number; videoId: string | null }) => {
      setPlayState(payload.playState);
      setCurrentTime(payload.currentTime);
      setVideoId(payload.videoId);
    });

    socket.on('user_joined', (payload: { participants: ParticipantSummary[] }) => {
      setParticipants(payload.participants);
    });

    socket.on('user_left', (payload: { participants: ParticipantSummary[] }) => {
      setParticipants(payload.participants);
    });

    socket.on('role_assigned', (payload: { userId: string; role: Role; participants: ParticipantSummary[] }) => {
      setParticipants(payload.participants);
      setYou((prev) => (prev && prev.userId === payload.userId ? { ...prev, role: payload.role } : prev));
    });

    socket.on('participant_removed', (payload: { participants: ParticipantSummary[] }) => {
      setParticipants(payload.participants);
    });

    socket.on('removed_from_room', () => {
      setRemoved(true);
    });

    return () => {
      socket.emit('leave_room', { roomId: roomCode });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, username]);

  const play = () => socketRef.current?.emit('play');
  const pause = () => socketRef.current?.emit('pause');
  const seek = (time: number) => socketRef.current?.emit('seek', { time });
  const changeVideo = (videoId: string) => socketRef.current?.emit('change_video', { videoId });
  const assignRole = (userId: string, role: Role) => socketRef.current?.emit('assign_role', { userId, role });
  const removeParticipant = (userId: string) => socketRef.current?.emit('remove_participant', { userId });
  const transferHost = (userId: string) => socketRef.current?.emit('transfer_host', { userId });

  return {
    connected,
    error,
    removed,
    participants,
    you,
    videoId,
    currentTime,
    playState,
    play,
    pause,
    seek,
    changeVideo,
    assignRole,
    removeParticipant,
    transferHost,
  };
}
