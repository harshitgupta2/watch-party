# End-to-End Build Guide — YouTube Watch Party

This document walks through building the whole project from an empty folder to a deployed app, in the order you'd actually do the work. Follow it top to bottom.

Stack: Vite + React + TypeScript (frontend), Node.js + Express (backend), Socket.IO (real-time), PostgreSQL (database).

> **Status:** this guide was written before implementation and is kept as the original plan. The actual schema ended up using `code` as the `rooms` primary key (not a separate `id`), since the app already treats the room code as its unique identifier everywhere — see `readme.md`'s [Persistence](readme.md#persistence) section for what was actually built.

---

## 0. Plan the data model first

Before writing code, settle the shapes you'll pass around — this keeps frontend/backend/DB consistent.

**Room**
```
id (uuid, PK)
code (short unique string, e.g. "AB3XZ9")
host_id (FK -> participant/user)
current_video_id (string, YouTube video id)
current_time (float, seconds)
play_state ('playing' | 'paused')
created_at
```

**Participant** (per-room membership, not a global user account for MVP)
```
id (uuid, PK)
room_id (FK -> Room)
socket_id (string, current connection — transient)
username (string)
role ('host' | 'moderator' | 'participant')
joined_at
```

Decide now: is a "user" only meaningful inside a room (MVP, no auth), or a persistent account across rooms (bonus)? Build MVP without auth first — a username + generated `userId` per socket connection is enough.

---

## 1. Repo scaffolding

```
Assingment_web3task/
├── client/     # Vite React TS app
├── server/     # Express + Socket.IO app
└── readme.md
```

```bash
# frontend
npm create vite@latest client -- --template react-ts

# backend
mkdir server && cd server
npm init -y
npm install express socket.io cors dotenv pg
npm install -D typescript ts-node-dev @types/express @types/node @types/cors
npx tsc --init
```

---

## 2. Backend: core server skeleton

Build in this order — each piece should run/compile before moving to the next.

1. **`server/src/index.ts`** — Express app + HTTP server + Socket.IO attached to the same HTTP server (Socket.IO needs the raw `http.Server`, not the Express app directly).
2. **`server/src/db/pool.ts`** — PostgreSQL connection pool using `pg`, reading `DATABASE_URL` from env.
3. **`server/src/db/migrations/001_init.sql`** — `rooms` and `participants` tables matching the data model above.
4. Verify: server boots, connects to Postgres, responds to a `GET /health` check.

## 3. Backend: OOP domain layer

This is the part the assignment explicitly calls out (bonus: OOP structure) — build it as real classes, not just handler functions with shared state.

- **`Room` class** — holds `id`, `code`, `videoId`, `currentTime`, `playState`, and a `Map<userId, Participant>`. Methods: `addParticipant()`, `removeParticipant()`, `getParticipants()`, `updatePlaybackState()`, `broadcast(event, payload)` (wraps `io.to(roomCode).emit(...)`).
- **`Participant` class** — `id`, `socketId`, `username`, `role`. Method: `hasPermission(action)` — encapsulate the role → allowed-actions mapping here so it's tested once and reused everywhere.
- **`RoomManager` class** (singleton or module-level instance) — in-memory map of `code -> Room` for fast runtime access, backed by Postgres for persistence/recovery. Methods: `createRoom()`, `getRoom(code)`, `deleteRoom(code)`.
- **`MessageHandler` / socket event router** — one file per concern (`playbackHandlers.ts`, `roleHandlers.ts`, `roomHandlers.ts`) registered on each new `io.on('connection', socket => {...})`. Each handler: look up the `Room`, look up the `Participant`, call `participant.hasPermission(action)`, reject or apply + broadcast.

Permission matrix to encode in `Participant.hasPermission`:

| Action | Host | Moderator | Participant |
|---|---|---|---|
| play/pause/seek/change_video | ✅ | ✅ | ❌ |
| assign_role / remove_participant / transfer_host | ✅ | ❌ | ❌ |

## 4. Backend: REST endpoints

Only two are needed for MVP — everything else is WebSocket:

- `POST /api/rooms` — creates a room row in Postgres, returns `{ roomId, code }`.
- `GET /api/rooms/:code` — validates a room exists before the frontend tries to join it (lets you show "room not found" without opening a socket).

## 5. Backend: Socket.IO event handlers

Implement in this order, testing each with a Socket.IO client script or Postman before wiring the frontend:

1. `join_room` → create/fetch `Participant`, add to `Room`, assign role (host if `Room.hostId` unset, else participant), emit `user_joined` to room, emit current `sync_state` to the joining socket only.
2. `leave_room` / socket `disconnect` → remove participant, emit `user_left`, handle host-leaves case (auto-transfer host to next participant, or close room).
3. `play`, `pause`, `seek`, `change_video` → permission check → update `Room` state → broadcast `sync_state`.
4. `assign_role` → host-only check → update participant role → broadcast `role_assigned`.
5. `remove_participant` → host-only check → disconnect that socket from the room, broadcast `participant_removed`.
6. (bonus) `transfer_host`.
7. (bonus) `chat_message`.

At every step: **validate role server-side before mutating state.** The frontend disabling a button is a UX nicety, not security.

## 6. Frontend: scaffolding and routing

- Pages: `Home` (create/join room form) and `Room` (video + participants + controls).
- `Home`: "Create Room" → `POST /api/rooms` → navigate to `/room/:code`. "Join Room" → input code → `GET /api/rooms/:code` to validate → navigate.
- Install `socket.io-client`.

## 7. Frontend: Socket.IO connection

- `hooks/useSocket.ts` — opens one Socket.IO connection when entering a `Room` page, emits `join_room` on connect, cleans up (`leave_room`, `socket.disconnect()`) on unmount.
- Keep all socket event listeners in one place (context or a single hook) so `Room.tsx` doesn't juggle raw socket calls — expose typed callbacks (`onSyncState`, `onUserJoined`, etc.) instead.

## 8. Frontend: YouTube player integration

- Load the YouTube IFrame API script once (in `index.html` or dynamically in a `useYouTubePlayer` hook).
- Wrap the player in a component that exposes `play()`, `pause()`, `seekTo(t)`, `loadVideo(id)` and reports player-ready state.
- **Important sync detail:** when the player receives a `sync_state` event from the server, call the player API directly — don't re-emit `play`/`pause`/`seek` from the player's own `onStateChange` in response to a remote update, or you'll create an event loop. Only emit playback events when the action was a genuine local user click (guard with a flag or by comparing incoming vs. current state).

## 9. Frontend: role-based UI

- Store `currentUser`'s role in room state (set from `join_room`/`role_assigned` responses).
- Disable play/pause/seek/change-video controls when role is `participant`.
- Show role badges next to each participant in the list; host sees a role-select dropdown and a remove button per participant.

## 10. Basic chat (optional bonus)

- `chat_message` event, no permission restriction (everyone can chat), server just relays with sender username + timestamp attached. Keep it in-memory only (not persisted) unless you want it in Postgres too.

## 11. Local end-to-end test pass

Open the room in two-plus browser tabs/profiles and verify:

- Creating a room makes you Host; joining from another tab makes you Participant.
- Host play/pause/seek/change-video reflects in the other tab within ~1s.
- Participant's controls are disabled in the UI **and** a raw `socket.emit('play')` from devtools in that tab is rejected server-side (test this — it's the actual security requirement, not just UI).
- Assigning Moderator to a participant immediately grants them working controls without a page refresh.
- Removing a participant disconnects/kicks them from the room.
- Host disconnecting (close tab) either transfers host or is handled gracefully, not a crash.

## 12. Deployment

1. **Database:** provision managed PostgreSQL (Render/Railway/Supabase). Run migrations against it.
2. **Backend:** deploy `server/` to Render or Railway. Set env vars: `DATABASE_URL`, `CLIENT_ORIGIN` (your deployed frontend URL, for CORS + Socket.IO `cors` config), `PORT`.
3. **Frontend:** deploy `client/` to Vercel/Netlify (or same Render service if serving statically from Express). Set `VITE_SERVER_URL` to the deployed backend URL.
4. Confirm Socket.IO connects over the deployed URLs (watch for CORS and mixed-content/`wss://` vs `ws://` issues — deployed frontend on HTTPS requires the backend to be HTTPS too, so Socket.IO auto-upgrades to `wss://`).
5. Re-run the full test pass from step 11 against the live URLs.
6. Update `readme.md` with the live URL.

## 13. Polish for "code walkthrough readiness"

Before presenting, be able to explain out loud, pointing at actual files:

- Where the permission check lives and why it's server-side (`Participant.hasPermission`, handlers in step 5).
- How `sync_state` prevents drift between clients (server is the single source of truth for `currentTime`/`playState`/`videoId`; clients never trust their own local player state as authoritative).
- Why Socket.IO over raw `ws` (rooms/broadcast helpers, automatic reconnection, fallback transports) — or your actual reasoning if you chose differently.
- One trade-off you hit (e.g., in-memory `RoomManager` state means rooms are lost on server restart unless rehydrated from Postgres on boot — mention if you did or didn't handle that).

## Stretch goals (if time remains)

- Persist room state to Postgres on every change (not just at creation) so a server restart doesn't lose active rooms.
- Redis pub/sub + Socket.IO Redis adapter if you want to demonstrate horizontal scaling awareness (not required for MVP-scale grading).
- Auth (even simple JWT) if you want persistent user identity across rooms/sessions.
