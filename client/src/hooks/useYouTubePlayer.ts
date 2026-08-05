import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal shape of the parts of the YouTube IFrame API this hook uses.
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
}

interface YTPlayerConstructor {
  new (elementId: string, options: unknown): YTPlayer;
}

declare global {
  interface Window {
    YT: { Player: YTPlayerConstructor };
    onYouTubeIframeAPIReady: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });

  return apiPromise;
}

export function useYouTubePlayer(elementId: string) {
  const playerRef = useRef<YTPlayer | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const lastAppliedTimeRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then(() => {
      // React 18 StrictMode runs this effect's mount→cleanup→mount twice in
      // dev; without this guard the cleanup below would race with a second
      // Player being constructed on the same DOM node, leaving playerRef
      // pointed at a different player than the iframe actually on screen.
      if (cancelled) return;
      // No videoId here — passing '' explicitly makes the player attempt
      // (and fail) an empty load, which renders YouTube's own error UI
      // behind our fallback overlay until cueVideoById/loadVideoById is
      // actually called from applyRemoteState.
      playerRef.current = new window.YT.Player(elementId, {
        height: '100%',
        width: '100%',
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, mute: 1 },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            // playVideo()/loadVideoById() calls triggered by an incoming
            // WebSocket event (not a synchronous click handler) don't count
            // as "user gesture" continuations to the browser — unmuted
            // autoplay would get silently blocked, for the host's own tab
            // included, since even their own click only reaches playVideo()
            // after a server round trip. Muted autoplay is always allowed,
            // so every player starts muted; users unmute with a real click.
            e.target.mute();
            setReady(true);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedVideoIdRef.current = null;
      lastAppliedTimeRef.current = null;
      setReady(false);
      setMuted(true);
    };
  }, [elementId]);

  // Only calls loadVideoById/seekTo when the video or the server's stored
  // time actually changed since the last applied state — the server does
  // NOT advance `currentTime` while a video plays (only on seek/change
  // video), so re-seeking on every play/pause broadcast would yank
  // playback back to a stale timestamp.
  const applyRemoteState = useCallback(
    (videoId: string | null, playState: 'playing' | 'paused', currentTime: number) => {
      const player = playerRef.current;
      if (!player || !ready) return;

      const isNewVideo = videoId !== null && videoId !== loadedVideoIdRef.current;

      if (isNewVideo) {
        loadedVideoIdRef.current = videoId;
        lastAppliedTimeRef.current = currentTime;
        // loadVideoById starts playing immediately; cueVideoById loads the
        // video and renders its first frame without playing. Calling
        // loadVideoById and then immediately pauseVideo() races the async
        // load and can leave the player showing nothing at all — so pick
        // the one that already matches the target play state instead of
        // loading then correcting.
        if (playState === 'playing') {
          player.loadVideoById(videoId, currentTime);
        } else {
          player.cueVideoById(videoId, currentTime);
        }
        return;
      }

      const isExplicitSeek = currentTime !== lastAppliedTimeRef.current;
      if (isExplicitSeek) {
        player.seekTo(currentTime, true);
        lastAppliedTimeRef.current = currentTime;
      }

      if (playState === 'playing') {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    },
    [ready],
  );

  const getCurrentTime = useCallback((): number => playerRef.current?.getCurrentTime() ?? 0, []);
  const getDuration = useCallback((): number => playerRef.current?.getDuration() ?? 0, []);

  // Must be called directly from a click handler (a real user gesture) —
  // that's what makes the browser willing to unmute at all.
  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isMuted()) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }, []);

  return { ready, applyRemoteState, getCurrentTime, getDuration, muted, toggleMute };
}
