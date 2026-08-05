# YouTube Watch Party

A real-time watch party system that lets multiple users watch YouTube videos together in sync. When the host or a moderator plays, pauses, seeks, or changes the video, everyone in the room sees the same action within about a second.

Built as an intern assignment demonstrating WebSocket-based real-time communication, room-based architecture, and role-based access control.

## Live Demo

- **App:** _add live deployment URL here_
- **Demo video / screenshots:** _optional, add link here_

## Features

- Create a watch party room (creator becomes **Host**), join via a 6-character room code
- Real-time playback sync — play, pause, seek, change video — via Socket.IO
- Role-based access control:
  - **Host** — full control (playback, assign roles, remove participants, transfer host)
  - **Moderator** — playback control (play/pause/seek/change video)
  - **Participant** — watch only, controls disabled in the UI
- Live participant list with role badges, updated in real time for everyone
- Host can promote/demote participants, remove them, or transfer host to someone else
- **Permissions are enforced on the server**, not just hidden in the UI — verified with a raw `socket.emit` bypassing the client entirely (see [Testing](#testing) below)
- Auto host-transfer if the host disconnects, so a room never gets stuck without a host

## Tech Stack

| Layer     | Technology                    |
| --------- | ------------------------------ |
| Frontend  | Vite + React 19 + TypeScript   |
| Backend   | Node.js + Express              |
| Real-time | Socket.IO                      |
| Database  | PostgreSQL (`pg`)              |
| Video     | YouTube IFrame Player API      |

**Database:** PostgreSQL persists room metadata (code, current video, playback position, play state) and a participant session log (who joined which room, with what role, when they left). The live room experience still runs off the in-memory `RoomManager`/`Room` for latency — every meaningful mutation write-throughs to Postgres in the background (fire-and-forget, logged on failure, never blocking the broadcast), and on boot the server rehydrates all persisted rooms back into memory so room codes and their last playback position survive a restart. See [Persistence](#persistence) below.

## Architecture Overview

```
client (Vite + React + TS)
      |
      |  HTTP  — POST /api/rooms, GET /api/rooms/:code
      |  WebSocket (socket.io-client)
      v
server (Node.js + Express + Socket.IO, same HTTP server)
      |
      |-- RoomManager — in-memory Map<code, Room> (live source of truth)
      |-- Room        — participants, playback state, broadcast()
      |-- Participant  — role + hasPermission(action)
      |
      |-- roomRepository (db/) — write-through persistence, fire-and-forget
      v
PostgreSQL — rooms (code, video_id, current_time_seconds, play_state)
             participant_sessions (room_code, user_id, username, role, joined_at, left_at)
```

1. A client calls `POST /api/rooms`; the server (`RoomManager.createRoom`) generates a unique 6-character code and returns it. No socket connection exists yet at this point.
2. The client connects over Socket.IO and emits `join_room` with that code. The server creates a `Participant`, adds it to the `Room` (first joiner becomes **Host** automatically), and acks back the current room state plus the participant's own role.
3. Playback events (`play`, `pause`, `seek`, `change_video`) sent by a client are checked against `Participant.hasPermission(action)` **before** anything happens — only Host/Moderator pass. Valid actions update the `Room`'s in-memory state and are broadcast to everyone in that Socket.IO room via `sync_state`.
4. Role events (`assign_role`, `remove_participant`, `transfer_host`) go through the same permission check, restricted to Host. Successful changes broadcast `role_assigned` / `participant_removed` with the updated participant list.
5. Each client renders the video with the YouTube IFrame API. Incoming `sync_state` drives `player.loadVideoById` / `seekTo` / `playVideo` / `pauseVideo` — the server's state is the single source of truth; clients never trust their own local player state.
6. On disconnect, the server removes the participant; if they were the host, it auto-promotes the next participant in the room and broadcasts the change.

## WebSocket Events (implemented)

| Event                | Direction        | Payload                                     | Description                                                        |
| --------------------- | ----------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| `join_room`           | Client → Server   | `{ roomId, username }` (ack callback)         | Joins; server assigns role, acks back full room state + your role     |
| `leave_room`          | Client → Server   | `{ roomId }`                                  | Leaves the room                                                       |
| `sync_state`          | Server → Clients  | `{ playState, currentTime, videoId }`         | Broadcast current video state                                         |
| `play` / `pause`      | Client → Server   | `{}`                                          | Requires Host/Moderator; server validates then broadcasts             |
| `seek`                | Client → Server   | `{ time }`                                    | Requires Host/Moderator; server validates then broadcasts             |
| `change_video`        | Client → Server   | `{ videoId }`                                 | Requires Host/Moderator; server validates then broadcasts             |
| `assign_role`         | Client → Server   | `{ userId, role }`                            | Host only; role is `moderator` or `participant`                       |
| `remove_participant`  | Client → Server   | `{ userId }`                                  | Host only                                                              |
| `transfer_host`       | Client → Server   | `{ userId }`                                  | Host only; hands host role to another participant                     |
| `user_joined`         | Server → Clients  | `{ username, userId, role, participants }`    | New participant joined                                                |
| `user_left`           | Server → Clients  | `{ username, userId, participants }`          | Participant left                                                      |
| `role_assigned`       | Server → Clients  | `{ userId, username, role, participants }`    | Role changed (promotion, demotion, or transfer)                       |
| `participant_removed` | Server → Clients  | `{ userId, participants }`                    | Participant removed by host                                           |
| `removed_from_room`   | Server → the removed client only | `{}`                          | Tells the removed client's UI to redirect home                        |

Chat is not implemented (was scoped as an optional bonus).

## Getting Started

### Prerequisites

- Node.js 18+
- A PostgreSQL instance — either a local install, or Docker (used during development, see below)

### 1. Install dependencies

```bash
git clone <repo-url>
cd Assingment_web3task

cd server && npm install
cd ../client && npm install
```

### 2. Start PostgreSQL

Any PostgreSQL 13+ instance works — this project was developed against a local Docker container:

```bash
docker run -d --name watchparty-postgres \
  -e POSTGRES_USER=watchparty \
  -e POSTGRES_PASSWORD=watchparty \
  -e POSTGRES_DB=watchparty \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3. Environment variables

Both `.env` files are already checked in with local-dev defaults; adjust if needed.

**server/.env**

```
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://watchparty:watchparty@localhost:5432/watchparty
```

**client/.env**

```
VITE_SERVER_URL=http://localhost:5000
```

### 4. Run the migration

```bash
cd server
npm run migrate   # creates the rooms and participant_sessions tables
```

### 5. Run locally

```bash
# terminal 1
cd server
npm run dev      # ts-node-dev, http://localhost:5000

# terminal 2
cd client
npm run dev      # vite, http://localhost:5173
```

Open two browser windows at `http://localhost:5173`, create a room in one, join with the code in the other.

### Other scripts

```bash
# server
npm run migrate # apply schema.sql to DATABASE_URL
npm run build    # tsc -> dist/ (also copies schema.sql into dist/db/)
npm run start    # node dist/index.js

# client
npm run build   # tsc -b && vite build
```

## Project Structure

```
Assingment_web3task/
├── client/
│   └── src/
│       ├── components/
│       │   └── ParticipantList.tsx    # role badges + host actions per participant
│       ├── hooks/
│       │   ├── useRoomSocket.ts       # owns the Socket.IO connection + room state
│       │   └── useYouTubePlayer.ts    # wraps the YT IFrame API, applies remote sync_state
│       ├── lib/
│       │   ├── api.ts                 # REST calls (create/get room)
│       │   └── youtube.ts             # video-ID parsing, time formatting
│       ├── pages/
│       │   ├── Home.tsx               # create/join room
│       │   └── Room.tsx               # player + controls + participant list
│       ├── types.ts
│       └── App.tsx                    # react-router routes
├── server/
│   └── src/
│       ├── domain/
│       │   ├── Participant.ts         # role + hasPermission(action)
│       │   ├── Room.ts                # participants, playback state, broadcast()
│       │   └── RoomManager.ts         # in-memory Map<code, Room>, code generation, rehydrate()
│       ├── db/
│       │   ├── pool.ts                # pg Pool from DATABASE_URL
│       │   ├── schema.sql             # rooms + participant_sessions tables
│       │   ├── migrate.ts             # applies schema.sql (npm run migrate)
│       │   ├── roomRepository.ts      # all SQL: insert/update rooms, join/leave sessions
│       │   └── persist.ts             # fire-and-forget wrapper, logs on failure
│       ├── routes/
│       │   └── rooms.ts               # POST /api/rooms, GET /api/rooms/:code
│       ├── sockets/
│       │   ├── roomHandlers.ts        # join_room, leave_room, disconnect
│       │   ├── playbackHandlers.ts    # play, pause, seek, change_video
│       │   └── roleHandlers.ts        # assign_role, remove_participant, transfer_host
│       ├── types.ts
│       └── index.ts                   # Express + Socket.IO wiring, rehydrate on boot
├── BUILD_GUIDE.md
└── readme.md
```

## Role Enforcement

Every playback and role-management socket handler resolves the sender's `Participant` from the room they're in and calls `participant.hasPermission(action)` before touching any state. Unauthorized events are silently dropped server-side — nothing is broadcast, and the in-memory room state is untouched. The frontend also disables the relevant buttons for participants, but that's a UX nicety on top of the real enforcement, not a substitute for it.

## Persistence

The in-memory `RoomManager` map is still what every socket handler reads and writes on the hot path — Postgres never sits between a client action and its broadcast. Instead:

- `RoomManager.createRoom()` inserts a `rooms` row after creating the in-memory `Room`.
- `playbackHandlers.ts` calls `roomRepository.updatePlaybackState()` right after every accepted `play`/`pause`/`seek`/`change_video`, alongside the `sync_state` broadcast.
- `roomHandlers.ts` logs a `participant_sessions` row on `join_room` (with the role they joined as) and stamps `left_at` on `leave_room`/`disconnect` — a session log, not live membership (live membership is whatever's in the in-memory `Room` right now).
- All of the above go through `persist()`, which fires the query and only logs on failure — a dropped DB connection degrades to "no persistence this tick," not a broken watch party.
- On boot, `RoomManager.rehydrate()` loads every `rooms` row into the in-memory map before the HTTP server starts listening. A room code created before a restart is still valid — `GET /api/rooms/:code` resolves and a client can join — but the participant list starts empty (sockets don't survive a restart), so the next person to join becomes host, same as any fresh room.
- `RoomManager.deleteIfEmpty()` only evicts the room from the in-memory map when the last participant leaves — the Postgres row is left in place on purpose, so the code and its last known playback position keep working if someone rejoins later or the server restarts while the room is momentarily empty.

Verified locally: created a room, changed video/seek/play, confirmed the row in `rooms` matched; killed the dev server; confirmed `GET /api/rooms/:code` still returned the same video/time/state after restart; rejoined via a raw socket and confirmed it worked.

## Testing

- **Manual/browser flow:** create room → join from a second tab → change video → play/pause → promote to moderator → remove participant, driven end-to-end with Playwright against both dev servers.
- **Server-side permission bypass check:** a raw `socket.io-client` connection (no UI involved) attempted `change_video`, `assign_role` (self-promotion to host), and `remove_participant` as a plain Participant. All three were rejected — confirmed by reading the room state back via `GET /api/rooms/:code` before/after — while the same actions succeeded when sent from the Host's socket.
- **Persistence:** created a room, drove `change_video`/`seek`/`play` over a raw socket, confirmed the `rooms` row matched; killed and restarted the dev server; confirmed `GET /api/rooms/:code` still returned the pre-restart video/time/state and that a fresh join to that code still worked.
- **Late-joiner sync:** reproduced a real bug this way — host plays a video, waits several seconds, then a second browser tab joins as a viewer. Before the fix, the viewer's actual `<video>` element landed near 0:00 while the host was several seconds in, because the server's stored `currentTime` was never updated while playing. After the fix (`Room.getLiveCurrentTime()` extrapolating from a `play()` timestamp), re-running the same scenario put both tabs within ~20ms of each other.

## Deployment (Render)

### Option A — Blueprint (recommended)

This repo includes [render.yaml](render.yaml), which declares all three resources (database, backend, frontend) at once:

1. Render dashboard → **New +** → **Blueprint** → connect this repo → **Apply**. Render provisions the Postgres database, backend Web Service, and frontend Static Site from `render.yaml` in one go.
2. Once both services have deployed and been assigned their `*.onrender.com` URLs, set the two env vars the Blueprint intentionally leaves blank (`sync: false` in the file — see the comment at the top of `render.yaml` for why these can't be auto-wired):
   - Backend service → Environment → `CLIENT_ORIGIN` → the frontend's URL
   - Frontend service → Environment → `VITE_SERVER_URL` → the backend's URL
3. Save each (triggers a redeploy of that service — the frontend one specifically needs a rebuild since `VITE_SERVER_URL` is baked in at build time, not read at runtime).

That's the entire manual part — everything else (build commands, start command, migration-on-boot, `DATABASE_URL` wiring) is already in the file.

### Option B — Manual, one resource at a time

Equivalent to the Blueprint above, done by hand through the dashboard — useful if you want to see exactly what each setting does, or aren't using the Blueprint flow.

#### 1. PostgreSQL

Render dashboard → **New +** → **PostgreSQL** → create it → copy the **Internal Database URL**.

#### 2. Backend — Web Service

**New +** → **Web Service** → connect this repo.

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run migrate && npm start` |

Environment variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | Internal Database URL from step 1 |
| `NODE_ENV` | `production` |
| `CLIENT_ORIGIN` | the Static Site URL from step 3 (placeholder until that exists, then come back and update it) |

`PORT` is injected automatically by Render — don't set it. Running `npm run migrate` on every boot is safe: [schema.sql](server/src/db/schema.sql) uses `CREATE TABLE IF NOT EXISTS`, so it's a no-op after the first successful run.

#### 3. Frontend — Static Site

**New +** → **Static Site** → same repo.

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

Environment variable:

| Key | Value |
|---|---|
| `VITE_SERVER_URL` | the backend Web Service URL from step 2 |

This must be set **before** the build runs — Vite bakes env vars into the JS bundle at build time, it doesn't read them at runtime.

#### 4. Wire them together

Go back to the backend service → Environment → set `CLIENT_ORIGIN` to the actual Static Site URL from step 3 → save (triggers a redeploy). In production, CORS only trusts the exact configured `CLIENT_ORIGIN` — the `localhost:*` wildcard used for local dev is disabled once `NODE_ENV=production`.

### Verify (either option)

Open the frontend URL, create a room, join from a second tab with the code, confirm play/pause/seek/change-video sync. Check the backend's Render logs for `Rehydrated N room(s) from Postgres` on boot to confirm the DB connection is live. Once confirmed, update the **Live Demo** URL at the top of this README.

## Trade-offs & Known Limitations

- **Persistence is write-through and fire-and-forget, not transactional.** A playback update is broadcast to clients before (or even if) its Postgres write completes — correct for a real-time app (nobody should wait on a DB round trip to see play/pause), but it means a crash in the exact window between broadcast and write could leave Postgres a beat behind the last live state. Acceptable here since Postgres is a recovery aid for restarts, not the runtime source of truth.
- **Rehydrated rooms lose their participant list**, not just their host — a restart is indistinguishable from "everyone left," so the next joiner becomes host again. Full session continuity across a restart would need persistent user identity (see "No auth" below), which was out of scope.
- **No cleanup job for empty rooms.** `deleteIfEmpty` only evicts from the in-memory map; the Postgres row for an abandoned room is never deleted, so `rooms` grows unbounded over a long-running deployment. Fine for an assignment demo, not for production.
- **No continuous drift correction.** `Room.getLiveCurrentTime()` extrapolates the position from a `Date.now()` checkpoint recorded on `play()`, so a client joining or resyncing mid-playback lands within about a network round-trip of everyone else (verified: ~20ms apart in testing) — this fixed an earlier bug where late joiners landed at the stale pre-play position instead. What's still missing is a periodic heartbeat to correct long-run clock drift between already-connected clients (e.g. one tab's video element running fractionally faster than another's over several minutes) — there's no mechanism pulling already-playing clients back in sync with each other once they've diverged from local playback-rate differences, only on the next real event (play/pause/seek/change video).
- **No auth.** Usernames are self-reported per socket connection, not tied to an account.
- **No chat** (optional bonus, not built).

## Autoplay & Sound

Every player starts **muted**, with a per-user 🔇/🔊 toggle to unmute — this is deliberate, not a bug. Playback here is always triggered by an incoming WebSocket event (`sync_state`), not a direct click on the video, even for the person who pressed Play themselves — the click only emits a socket event; the actual `player.playVideo()` call happens later, inside the handler for the server's broadcast back. Browsers do not treat that as a continuation of the original click, so unmuted autoplay gets silently blocked — inconsistently, since real browsers also factor in per-site autoplay history, which is why it can appear to work for one tab and not another depending on that browser profile's history with youtube.com. Muted autoplay is unconditionally allowed in every browser, so starting muted and unmuting via a direct button click (which *is* a fresh gesture) sidesteps the restriction entirely rather than fighting browser-specific heuristics.
