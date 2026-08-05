import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, fetchRoom } from '../lib/api';

export default function Home() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const goToRoom = (code: string) => {
    sessionStorage.setItem('username', username.trim());
    navigate(`/room/${code}`);
  };

  const handleCreate = async () => {
    if (!username.trim()) {
      setError('Enter a username first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom();
      goToRoom(room.code);
    } catch {
      setError('Could not create room. Is the server running?');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Enter a username first');
      return;
    }
    if (!joinCode.trim()) {
      setError('Enter a room code');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetchRoom(joinCode.trim().toUpperCase());
      goToRoom(joinCode.trim().toUpperCase());
    } catch {
      setError('Room not found');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      {/* ambient background glow */}
      <div className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full bg-fuchsia-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-2xl shadow-lg shadow-fuchsia-500/20">
            ▶
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Watch Party</h1>
          <p className="mt-2 text-sm text-slate-400">Watch YouTube videos together, perfectly in sync.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <label className="mb-6 block">
            <span className="mb-2 block text-sm font-medium text-slate-300">Your name</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Harshit_room"
              maxLength={20}
              className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-fuchsia-400/60 focus:ring-2 focus:ring-fuchsia-400/30"
            />
          </label>

          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-4 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
          >
            Create a room
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">or join existing</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room code"
              maxLength={6}
              className="w-full min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 tracking-widest text-white uppercase placeholder-slate-500 outline-none transition focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/30"
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-5 py-3 font-semibold text-white transition hover:bg-white/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Join
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          The host controls playback — everyone else watches in sync.
        </p>
      </div>
    </div>
  );
}
