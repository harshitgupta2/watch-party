# WatchMe — YouTube Watch Party

A real-time watch party app that lets multiple people watch YouTube videos together in sync. When the host or a moderator plays, pauses, seeks, or changes the video, everyone in the room follows within about a second.

## 🔗 Live Demo

**App:** https://watch-party-frontend-watt.onrender.com/

## Demo Video

**Video:** https://www.loom.com/share/99114707d0ba4f60a361198ada1b90e1

> Note: the backend is hosted on Render's free tier, so the first request after a period of inactivity may take ~30–60 seconds to wake up.

## Tech Stack

| Layer     | Technology                          |
| --------- | ----------------------------------- |
| Frontend  | Vite + React 19 + TypeScript + Tailwind |
| Backend   | Node.js + Express + TypeScript      |
| Real-time | Socket.IO                           |
| Database  | PostgreSQL (`pg`)                   |
| Video     | YouTube IFrame Player API           |

## Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** running locally (or a connection string to a hosted instance)
- **npm**

The repo has two independent apps:

```
.
├── server/   # Express + Socket.IO API (port 5000)
└── client/   # Vite + React frontend  (port 5173)
```

## Setup & Run (local development)

### 1. Clone

```bash
git clone <your-repo-url>
cd Assingment_web3task
```

### 2. Set up the database

Create a PostgreSQL database and user (example values match the default `DATABASE_URL` below):

```sql
CREATE USER watchparty WITH PASSWORD 'watchparty';
CREATE DATABASE watchparty OWNER watchparty;
```

### 3. Start the backend

```bash
cd server
npm install
```

Create a `server/.env` file (it is git-ignored, so you must add it yourself):

```env
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://watchparty:watchparty@localhost:5432/watchparty
NODE_ENV=development
```

Run the database migration once, then start the dev server:

```bash
npm run migrate   # creates the rooms + participant_sessions tables
npm run dev       # starts the API on http://localhost:5000
```

You should see `Server running on port 5000`.

### 4. Start the frontend

In a **second terminal**:

```bash
cd client
npm install
```

Create a `client/.env` file:

```env
VITE_SERVER_URL=http://localhost:5000
```

Then start the client:

```bash
npm run dev       # starts the app on http://localhost:5173
```

### 5. Open the app

Open **http://localhost:5173** in two browser windows (use one normal + one incognito so each has its own identity).

- **Window A:** enter a name → **Create a room** → copy the 6-character code.
- **Window B:** enter a name → paste the code → **Join**.
- The host loads a YouTube URL/ID and controls playback; everyone else watches in sync.

> Sound starts **muted** on every player — browsers block autoplaying audio until you interact with the page, so click 🔊 to unmute. Video stays in sync automatically.

## Production Build

**Backend**

```bash
cd server
npm run build     # compiles TypeScript to dist/ and copies schema.sql
npm start         # runs node dist/index.js
```

**Frontend**

```bash
cd client
npm run build     # type-checks and builds to dist/
npm run preview   # serves the production build locally
```

For a deployed frontend, point it at your deployed backend via `client/.env.production`:

```env
VITE_SERVER_URL=https://<your-backend-host>
```

## Available Scripts

**server**

| Script            | Description                                  |
| ----------------- | -------------------------------------------- |
| `npm run dev`     | Start API with hot reload (`ts-node-dev`)    |
| `npm run migrate` | Apply the database schema                    |
| `npm run build`   | Compile TypeScript to `dist/`                |
| `npm start`       | Run the compiled server                      |

**client**

| Script            | Description                        |
| ----------------- | ---------------------------------- |
| `npm run dev`     | Start Vite dev server              |
| `npm run build`   | Type-check and build for production |
| `npm run preview` | Preview the production build       |
| `npm run lint`    | Run oxlint                         |

## Environment Variables

**server/.env**

| Variable        | Example                                                       | Description                              |
| --------------- | ------------------------------------------------------------ | ---------------------------------------- |
| `PORT`          | `5000`                                                       | Port the API listens on                  |
| `CLIENT_ORIGIN` | `http://localhost:5173`                                      | Allowed CORS origin for the frontend     |
| `DATABASE_URL`  | `postgresql://watchparty:watchparty@localhost:5432/watchparty` | PostgreSQL connection string           |
| `NODE_ENV`      | `development`                                                | Environment mode                         |

**client/.env**

| Variable          | Example                 | Description                    |
| ----------------- | ----------------------- | ------------------------------ |
| `VITE_SERVER_URL` | `http://localhost:5000` | Base URL of the backend API    |
