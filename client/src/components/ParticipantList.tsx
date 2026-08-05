import type { ParticipantSummary, Role } from '../types';

interface Props {
  participants: ParticipantSummary[];
  you: ParticipantSummary | null;
  isHost: boolean;
  onAssignRole: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
  onTransferHost: (userId: string) => void;
}

const ROLE_STYLES: Record<Role, string> = {
  host: 'bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-inset ring-fuchsia-400/30',
  moderator: 'bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-400/30',
  participant: 'bg-white/10 text-slate-300 ring-1 ring-inset ring-white/10',
};

const AVATAR_STYLES: Record<Role, string> = {
  host: 'bg-gradient-to-br from-fuchsia-500 to-pink-500',
  moderator: 'bg-gradient-to-br from-indigo-500 to-blue-500',
  participant: 'bg-slate-700',
};

export default function ParticipantList({ participants, you, isHost, onAssignRole, onRemove, onTransferHost }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {participants.map((p) => (
        <li
          key={p.userId}
          className="rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-white/20"
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${AVATAR_STYLES[p.role]}`}
            >
              {p.username.slice(0, 1).toUpperCase()}
            </div>

            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
              {p.username}
              {you?.userId === p.userId && <span className="text-slate-500"> (you)</span>}
            </span>

            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[p.role]}`}>
              {p.role}
            </span>
          </div>

          {isHost && p.role !== 'host' && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 pl-11">
              {p.role === 'participant' ? (
                <button
                  onClick={() => onAssignRole(p.userId, 'moderator')}
                  className="rounded-md bg-indigo-500/15 px-2 py-1 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/25"
                >
                  Make moderator
                </button>
              ) : (
                <button
                  onClick={() => onAssignRole(p.userId, 'participant')}
                  className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/20"
                >
                  Revoke moderator
                </button>
              )}
              <button
                onClick={() => onTransferHost(p.userId)}
                className="rounded-md bg-fuchsia-500/15 px-2 py-1 text-xs font-medium text-fuchsia-300 transition hover:bg-fuchsia-500/25"
              >
                Make host
              </button>
              <button
                onClick={() => onRemove(p.userId)}
                className="rounded-md bg-red-500/15 px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/25"
              >
                Remove
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
