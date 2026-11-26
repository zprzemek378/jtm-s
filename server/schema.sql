-- The whole database.
--
-- Written to be run again safely: every statement is `if not exists`, so this
-- file is both the schema and the migration for a database that has some of it
-- already. Timestamps are milliseconds since the epoch, as everywhere else.

CREATE TABLE IF NOT EXISTS accounts (
  -- The Spotify account id.
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS universes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES accounts (id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  universe_id TEXT NOT NULL REFERENCES universes (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (universe_id, account_id)
);

CREATE INDEX IF NOT EXISTS members_by_account ON members (account_id);

-- Players belong to the universe, not to whoever was hosting. The number is
-- what every game refers to, so renaming somebody keeps their history and
-- deleting them only deactivates: the history still needs the name.
CREATE TABLE IF NOT EXISTS players (
  universe_id TEXT NOT NULL REFERENCES universes (id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  colour TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (universe_id, number)
);

-- A game, with everything the backend never looks inside kept as JSON: the
-- rules, the line-up and the track list are the client's shape, and the
-- backend holding an opinion about them would mean a migration every time the
-- game changes.
CREATE TABLE IF NOT EXISTS games (
  -- Chosen by the client, so sending a game twice stores it once.
  id TEXT PRIMARY KEY,
  universe_id TEXT REFERENCES universes (id) ON DELETE CASCADE,
  host_id TEXT NOT NULL REFERENCES accounts (id),
  history_key TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  closed_at INTEGER,
  origin TEXT NOT NULL,
  -- The tracks it can draw from, for picking a game up on another machine.
  -- Dropped when the game ends, and never stored at all for a list too large
  -- to be worth it.
  catalogue TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS games_by_universe ON games (universe_id, started_at DESC);
CREATE INDEX IF NOT EXISTS games_by_host ON games (host_id, started_at DESC);

-- What happened, in order. The client numbers the events, so a retried batch
-- overwrites itself rather than duplicating.
CREATE TABLE IF NOT EXISTS events (
  game_id TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  -- The clock of the machine that played it.
  at INTEGER NOT NULL,
  -- The same moment, corrected by the skew measured when the batch arrived.
  server_at INTEGER NOT NULL,
  action TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);
