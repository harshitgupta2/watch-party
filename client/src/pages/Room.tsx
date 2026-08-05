import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';
import ParticipantList from '../components/ParticipantList';
import { extractVideoId, formatTime } from '../lib/youtube';

const PLAYER_ELEMENT_ID = 'yt-player';

export default function Room() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const username = sessionStorage.getItem('username') ?? '';

  useEffect(() => {
    if (!username) navigate('/');
  }, [username, navigate]);

  const {
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
  } = useRoomSocket(code, username);

  const { applyRemoteState, getCurrentTime, getDuration, ready, muted, toggleMute } = useYouTubePlayer(PLAYER_ELEMENT_ID);
  const [videoInput, setVideoInput] = useState('');
  const [sliderTime, setSliderTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dragging = useRef(false);
  const playerWrapperRef = useRef<HTMLDivElement>(null);

  const canControl = you?.role === 'host' || you?.role === 'moderator';
  const isHost = you?.role === 'host';

  useEffect(() => {
    if (!ready) return;
    applyRemoteState(videoId, playState, currentTime);
  }, [ready, videoId, playState, currentTime, applyRemoteState]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!ready) return;
      if (!dragging.current) setSliderTime(getCurrentTime());
      setDuration(getDuration());
    }, 1000);
    return () => clearInterval(interval);
  }, [ready, getCurrentTime, getDuration]);

  useEffect(() => {
    if (removed) {
      alert('You were removed from the room by the host.');
      navigate('/');
    }
  }, [removed, navigate]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerWrapperRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      playerWrapperRef.current?.requestFullscreen();
    }
  };

  const handleChangeVideo = () => {
    const id = extractVideoId(videoInput);
    if (!id) {
      alert('Could not parse a YouTube video from that link/ID.');
      return;
    }
    changeVideo(id);
    setVideoInput('');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!username) return null;

  return (
    <div className="min-h-full bg-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-white">Room</h2>
              <button
                onClick={handleCopyCode}
                title="Copy room code"
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-sm font-semibold tracking-widest text-fuchsia-300 transition hover:bg-white/10"
              >
                {code}
                <span className="text-xs text-slate-500">{copied ? '✓ copied' : '⧉'}</span>
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
                {connected ? 'Connected' : 'Connecting…'}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
          >
            Leave
          </button>
        </header>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Player column */}
          <div>
            <div
              ref={playerWrapperRef}
              className={
                isFullscreen
                  ? 'flex h-full w-full flex-col justify-center gap-4 bg-slate-950 p-4'
                  : ''
              }
            >
            <div className={`relative w-full overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 ${isFullscreen ? 'flex-1 rounded-none' : 'aspect-video rounded-2xl'}`}>
              <div id={PLAYER_ELEMENT_ID} className="absolute inset-0 h-full w-full" />

              <button
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-black/50 text-white opacity-80 backdrop-blur transition hover:bg-black/70 hover:opacity-100"
              >
                {isFullscreen ? '⤡' : '⛶'}
              </button>

              {!videoId && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-900 px-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-indigo-500/20 text-2xl ring-1 ring-white/10">
                    🎬
                  </div>
                  {canControl ? (
                    <>
                      <p className="text-sm font-semibold text-white">No video playing yet</p>
                      <p className="max-w-xs text-sm text-slate-400">
                        Please paste a video link or video ID below to get started.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-white">Waiting for the host</p>
                      <p className="max-w-xs text-sm text-slate-400">
                        The host or a moderator hasn't started a video yet.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Playback controls */}
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <button
                onClick={play}
                disabled={!canControl}
                aria-label="Play"
                title="Play"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300 transition hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-fuchsia-500/15"
              >
                ▶
              </button>
              <button
                onClick={pause}
                disabled={!canControl}
                aria-label="Pause"
                title="Pause"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-200 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10"
              >
                ⏸
              </button>

              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                value={sliderTime}
                disabled={!canControl}
                onMouseDown={() => (dragging.current = true)}
                onTouchStart={() => (dragging.current = true)}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  setSliderTime(t);
                  dragging.current = false;
                  if (canControl) seek(t);
                }}
                onInput={(e) => setSliderTime(Number((e.target as HTMLInputElement).value))}
                className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-fuchsia-500 disabled:cursor-not-allowed"
              />
              <span className="w-24 shrink-0 text-right font-mono text-xs text-slate-400">
                {formatTime(sliderTime)} / {formatTime(duration)}
              </span>

              <button
                onClick={toggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
                title={muted ? 'Unmute' : 'Mute'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                  muted
                    ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                {muted ? '🔇' : '🔊'}
              </button>
            </div>
            {muted && (
              <p className="mt-2 text-xs text-amber-300/80">
                Sound is muted — browsers block autoplaying sound until you interact with the player. Click 🔇 to unmute.
              </p>
            )}
            </div>

            {canControl ? (
              <div className="mt-4 mb-4 flex gap-2">
                <input
                  value={videoInput}
                  onChange={(e) => setVideoInput(e.target.value)}
                  placeholder="Paste a YouTube URL or video ID"
                  className="w-full min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-400/30"
                />
                <button
                  onClick={handleChangeVideo}
                  className="shrink-0 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-fuchsia-500/20 transition hover:brightness-110 active:scale-[0.98]"
                >
                  Change video
                </button>
              </div>
            ) : (
              <p className="mt-4 mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-400">
                You are a participant — playback is controlled by the host/moderator.
              </p>
            )}
          </div>

          {/* Sidebar */}
          <aside className="rounded-2xl border border-white/10 bg-white/5 p-4 lg:h-fit">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <span>Participants</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-slate-300">
                {participants.length}
              </span>
            </h3>
            <ParticipantList
              participants={participants}
              you={you}
              isHost={isHost}
              onAssignRole={assignRole}
              onRemove={removeParticipant}
              onTransferHost={transferHost}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
