-- Initial schema.
--
-- Shaped around the free plan's write and read ceilings rather than around what is
-- convenient, because the limits are the design constraint here (see the plan's quota
-- arithmetic). Two rules run through all of it:
--
--   * Small, indexed rows only. D1 counts every row a query SCANS against the 5M
--     rows-read/day allowance, so an unindexed lookup repeated per page view burns it
--     far faster than the row count suggests.
--   * A large blob NEVER lives in a row that gets scanned. A match timeline is a
--     single compressed column, never one row per event — per-event rows would be
--     ~30,000 writes/day at 100 matches, a third of the daily write allowance, and one
--     feature away from the wall.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  -- NFKC-casefolded, and UNIQUE on that form: it is what blocks `Gabriel` from being
  -- impersonated by `GabrieI`, and what the derived salt is computed from.
  username_norm TEXT UNIQUE,
  -- As typed, for display only. Never compared.
  username      TEXT,
  -- sha256(pepper || client-derived key). A fast hash is fine over a 256-bit input:
  -- the stretching that makes a stolen row useless already happened on the device.
  pw_hash       TEXT,
  -- sha256(pepper || recovery code). Shown once at signup, never again.
  recovery_hash TEXT,
  kind          TEXT NOT NULL CHECK (kind IN ('guest', 'full')),
  created_at    INTEGER NOT NULL,
  -- Set when an account is ejected; kept rather than deleted so its past results stand.
  disabled_at   INTEGER
);

-- A guest has no username and no password until it is claimed, so those columns are
-- nullable — but a FULL account must have both, and SQLite will not express that in a
-- column constraint. Hence a table-level check via a partial index is not possible
-- either; the upgrade statement enforces it with `rows_affected = 1`.
CREATE INDEX users_kind ON users (kind);

-- Refresh tokens. The ACCESS token is a signed value carrying its own expiry and is
-- never stored — that is what keeps a normal request off the database entirely. Refresh
-- tokens are stored so that logging out, losing a device or rotating after a scare can
-- actually invalidate something.
CREATE TABLE sessions (
  -- sha256 of the token. The token itself is only ever in the client's hands.
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  -- Free request metadata, for showing a user their own sessions.
  label      TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- The player pool a draft picks from, and the clubs a 1v1 chooses between.
-- Attributes are NOT here: the server never simulates, so it needs only enough to
-- validate a pick (does this player exist, what position is he, roughly how good).
-- ---------------------------------------------------------------------------

CREATE TABLE clubs_pool (
  id         TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  short_name TEXT NOT NULL
);
CREATE INDEX clubs_dataset ON clubs_pool (dataset_id);

CREATE TABLE players_pool (
  id         TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  club_id    TEXT,
  name       TEXT NOT NULL,
  position   TEXT NOT NULL,
  -- Only for autopick and squad-legality checks, never for simulating.
  overall    INTEGER NOT NULL
);
CREATE INDEX players_dataset_pos ON players_pool (dataset_id, position);
CREATE INDEX players_club ON players_pool (club_id);

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------

CREATE TABLE matches (
  id                  TEXT PRIMARY KEY,
  -- Which competition this belongs to, if any (a friendly has none).
  competition_id      TEXT,
  round               INTEGER,
  -- The engine the record NAMES. An attester runs this one, not the one it would pick.
  engine              TEXT NOT NULL CHECK (engine IN ('zone', 'spatial')),
  engine_version      TEXT NOT NULL,
  protocol_version    INTEGER NOT NULL,
  -- Minted at lockup from the two sealed lineup hashes, and only then.
  seed                INTEGER,
  roster_snapshot_hash TEXT,
  home_club_id        TEXT NOT NULL,
  away_club_id        TEXT NOT NULL,
  home_user_id        TEXT REFERENCES users (id),
  away_user_id        TEXT REFERENCES users (id),
  -- The full sealed inputs, as canonical JSON. ~1.5KB, read only when a client is
  -- about to simulate — so it lives in a row nothing scans by content.
  home_input          TEXT,
  away_input          TEXT,
  lineups_due_at      INTEGER,
  kickoff_at          INTEGER,
  state               TEXT NOT NULL CHECK (
    state IN ('awaiting_lineups', 'determined', 'provisional', 'confirmed', 'void')
  ),
  created_at          INTEGER NOT NULL
);
CREATE INDEX matches_competition ON matches (competition_id, round);
CREATE INDEX matches_state_kickoff ON matches (state, kickoff_at);
CREATE INDEX matches_home_user ON matches (home_user_id);
CREATE INDEX matches_away_user ON matches (away_user_id);

-- The DENORMALISED outcome, and the historical fact of record.
--
-- Standings read only this and never re-derive a table from a replay: an engine bump
-- would otherwise retroactively change last season's champion. `(seed, inputs)` is a
-- reproduction recipe valid only for the engine version it names; this is the result.
CREATE TABLE results (
  match_id    TEXT PRIMARY KEY REFERENCES matches (id),
  home_score  INTEGER NOT NULL,
  away_score  INTEGER NOT NULL,
  -- Digest of the full report the attesters agreed on.
  result_root TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('provisional', 'confirmed', 'void', 'forfeit')),
  -- Goals, cards and per-player lines, as one compressed blob. See the header note.
  report      BLOB,
  settled_at  INTEGER NOT NULL
);

CREATE TABLE attestations (
  match_id       TEXT NOT NULL REFERENCES matches (id),
  user_id        TEXT NOT NULL REFERENCES users (id),
  engine_version TEXT NOT NULL,
  result_root    TEXT NOT NULL,
  home_score     INTEGER NOT NULL,
  away_score     INTEGER NOT NULL,
  event_count    INTEGER NOT NULL,
  submitted_at   INTEGER NOT NULL,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX attestations_match ON attestations (match_id);

-- Work waiting for an idle client's CPU. Assignment is deliberately unpredictable and
-- gives at most one slot to a participant, so nobody can arrange to be both attesters
-- for their own fixture.
CREATE TABLE verification_jobs (
  match_id     TEXT PRIMARY KEY REFERENCES matches (id),
  attempts     INTEGER NOT NULL DEFAULT 0,
  first_root   TEXT,
  first_by     TEXT REFERENCES users (id),
  first_at     INTEGER,
  status       TEXT NOT NULL CHECK (status IN ('open', 'provisional', 'settled', 'disputed')),
  claimable_at INTEGER NOT NULL
);
CREATE INDEX jobs_claimable ON verification_jobs (status, claimable_at);

-- ---------------------------------------------------------------------------
-- Competitions
-- ---------------------------------------------------------------------------

CREATE TABLE leagues (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  dataset_id     TEXT NOT NULL,
  -- Pinned for the whole season. In-flight leagues never migrate.
  engine_version TEXT NOT NULL,
  join_code      TEXT UNIQUE,
  -- Minutes past midnight UTC. Cron triggers are UTC-only, so the league's local
  -- preference is converted on the way in and shown converted on the way out.
  kickoff_minute INTEGER NOT NULL,
  state          TEXT NOT NULL CHECK (state IN ('forming', 'running', 'finished')),
  created_at     INTEGER NOT NULL
);

CREATE TABLE league_members (
  league_id TEXT NOT NULL REFERENCES leagues (id),
  user_id   TEXT NOT NULL REFERENCES users (id),
  club_id   TEXT NOT NULL,
  -- Consecutive missed matchdays; N in a row ejects. A no-show does NOT forfeit,
  -- because every member always has a standing lineup on file.
  absences  INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, user_id)
);
CREATE INDEX members_league ON league_members (league_id);

-- The standing lineup. A matchday submission merely overrides it, which is what makes
-- a missed matchday a non-event instead of a forfeit.
CREATE TABLE standing_lineups (
  league_id TEXT NOT NULL REFERENCES leagues (id),
  user_id   TEXT NOT NULL REFERENCES users (id),
  input     TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, user_id)
);

-- Materialised on confirmation. Recomputing a table from raw fixtures on every view
-- would be ~7.6M rows read a day at ten leagues — past the 5M allowance.
CREATE TABLE standings_materialized (
  league_id       TEXT NOT NULL REFERENCES leagues (id),
  club_id         TEXT NOT NULL,
  played          INTEGER NOT NULL,
  won             INTEGER NOT NULL,
  drawn           INTEGER NOT NULL,
  lost            INTEGER NOT NULL,
  goals_for       INTEGER NOT NULL,
  goals_against   INTEGER NOT NULL,
  points          INTEGER NOT NULL,
  -- Fixtures counted but not yet confirmed, so the UI can say "N outstanding" instead
  -- of quietly showing a table that will move.
  provisional     INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (league_id, club_id)
);

CREATE TABLE elo (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  rating  INTEGER NOT NULL,
  played  INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
