CREATE TABLE IF NOT EXISTS rooms (
  code VARCHAR(10) PRIMARY KEY,
  video_id TEXT,
  current_time_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
  play_state VARCHAR(10) NOT NULL DEFAULT 'paused',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A row per participant per join (not just per user) — a "session log" rather
-- than live membership, since live membership already lives in the in-memory
-- Room and disappears on disconnect regardless of what's in this table.
CREATE TABLE IF NOT EXISTS participant_sessions (
  id BIGSERIAL PRIMARY KEY,
  room_code VARCHAR(10) NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_participant_sessions_room_code ON participant_sessions (room_code);
