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

// YouTube IFrame player state codes -> readable names, for logging.
const YT_STATE: Record<number, string> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
};

let apiPromise: Promise<void> | null = null;

// Exported so callers (e.g. the Home page) can start downloading the YouTube
// IFrame API *before* a room is opened. The result is memoized in apiPromise,
// so by the time the Room mounts the script is already cached and the player
// constructs instantly instead of waiting ~1-2s on the first room.
export function loadYouTubeApi(): Promise<void> {
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
  // Whether the room's latest state wants the video playing. The autoplay
  // recovery timer consults this so a play that a later pause superseded isn't
  // force-resumed.
  const desiredPlayingRef = useRef(false);
  const recoverTimerRef = useRef<number | null>(null);
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
            console.log('[watchme][player] ready');
            e.target.mute();
            setReady(true);
          },
          // Event-driven enforcement of the room's play state. onStateChange
          // fires on every real change in the player — including when the
          // browser SILENTLY blocks a programmatic play() and the video just
          // stays paused. If the server says the room is PLAYING but our
          // player has fallen to paused/cued, re-assert play, muted (always
          // allowed). This keeps a viewer in sync regardless of *why*
          // playback stalled: autoplay policy, buffering settle, ad end, etc.
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            console.log(
              `[watchme][player] state -> ${YT_STATE[e.data] ?? e.data} | room wants: ${desiredPlayingRef.current ? 'playing' : 'paused'}`,
            );
            if (desiredPlayingRef.current && (e.data === 2 || e.data === 5)) {
              const p = e.target;
              if (!p.isMuted()) {
                p.mute();
                setMuted(true);
              }
              p.playVideo();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (recoverTimerRef.current !== null) {
        window.clearTimeout(recoverTimerRef.current);
        recoverTimerRef.current = null;
      }
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedVideoIdRef.current = null;
      lastAppliedTimeRef.current = null;
      setReady(false);
      setMuted(true);
    };
  }, [elementId]);

  // A programmatic play() on a viewer tab that hasn't had a direct user gesture
  // is rejected by the browser's autoplay policy UNLESS the player is muted —
  // and because the YouTube video runs in a cross-origin iframe, the viewer
  // clicking our own "unmute" button never counts as a gesture inside that
  // iframe. So once a viewer unmutes, host-driven plays get silently blocked
  // and they fall out of sync. To keep everyone in sync regardless: if the
  // video hasn't actually started shortly after we asked it to, mute and retry
  // (muted playback is always allowed). Sound then just needs one more click.
  const ensurePlaying = useCallback(() => {
    if (recoverTimerRef.current !== null) window.clearTimeout(recoverTimerRef.current);
    let attempts = 0;
    const check = () => {
      recoverTimerRef.current = null;
      const player = playerRef.current;
      if (!player || !desiredPlayingRef.current) return; // host paused meanwhile
      const state = player.getPlayerState();
      // 1 = playing, 3 = buffering (about to play) — we're in sync, done.
      if (state === 1 || state === 3) return;
      // Otherwise the play was blocked (or the player wasn't ready yet).
      // Guarantee muted playback, which the browser always allows, and keep
      // retrying for a short window since mute()/playVideo() are async and the
      // first attempt can race the player becoming ready.
      if (!player.isMuted()) {
        player.mute();
        setMuted(true);
      }
      player.playVideo();
      if (attempts++ < 4) recoverTimerRef.current = window.setTimeout(check, 400);
    };
    recoverTimerRef.current = window.setTimeout(check, 500);
  }, []);

  // Symmetric safety net for pause: seekTo()'s async completion can re-assert
  // "playing" just after we pause, so verify shortly after and re-pause if the
  // video slipped back into playing/buffering. Guards against a viewer that
  // keeps playing after the host hit pause.
  const ensurePaused = useCallback(() => {
    if (recoverTimerRef.current !== null) window.clearTimeout(recoverTimerRef.current);
    recoverTimerRef.current = window.setTimeout(() => {
      recoverTimerRef.current = null;
      const player = playerRef.current;
      if (!player || desiredPlayingRef.current) return; // host resumed meanwhile
      const state = player.getPlayerState();
      if (state === 1 || state === 3) player.pauseVideo();
    }, 500);
  }, []);

  // Only calls loadVideoById/seekTo when the video or the server's stored
  // time actually changed since the last applied state — the server does
  // NOT advance `currentTime` while a video plays (only on seek/change
  // video), so re-seeking on every play/pause broadcast would yank
  // playback back to a stale timestamp.
  const applyRemoteState = useCallback(
    (videoId: string | null, playState: 'playing' | 'paused', currentTime: number) => {
      const player = playerRef.current;
      if (!player || !ready) {
        console.log(`[watchme][player] applyRemoteState SKIPPED (player=${!!player}, ready=${ready})`);
        return;
      }

      desiredPlayingRef.current = playState === 'playing';

      const isNewVideo = videoId !== null && videoId !== loadedVideoIdRef.current;
      console.log(
        `[watchme][player] applyRemoteState -> playState=${playState} time=${currentTime.toFixed(2)} newVideo=${isNewVideo} currentPlayerState=${YT_STATE[player.getPlayerState()] ?? '?'}`,
      );

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
          ensurePlaying();
        } else {
          player.cueVideoById(videoId, currentTime);
        }
        return;
      }

      const isExplicitSeek = currentTime !== lastAppliedTimeRef.current;
      if (isExplicitSeek) lastAppliedTimeRef.current = currentTime;

      if (playState === 'playing') {
        // Seek first, then play — playing from the right spot.
        if (isExplicitSeek) player.seekTo(currentTime, true);
        player.playVideo();
        ensurePlaying();
      } else {
        // Pause BEFORE seeking. seekTo() on a *playing* player keeps it playing
        // and its async completion can override a pause issued right after — so
        // pause first, then seek the now-paused player to the exact spot (it
        // stays paused, showing that frame).
        player.pauseVideo();
        if (isExplicitSeek) player.seekTo(currentTime, true);
        ensurePaused();
      }
    },
    [ready, ensurePlaying, ensurePaused],
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
