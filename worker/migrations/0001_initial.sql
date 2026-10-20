PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  league_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
-- A bounded league aggregate lets picks, trades and score snapshots commit in
-- one conditional UPDATE. revision prevents lost writes from concurrent clients.
CREATE TABLE leagues (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(json_valid(state)),
  revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE tournament_stats (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  data TEXT NOT NULL CHECK(json_valid(data)),
  updated_at TEXT NOT NULL
);
