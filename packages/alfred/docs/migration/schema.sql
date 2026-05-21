-- Alfred Database Schema (Node 26 SQLite)
-- Version: 1.0
-- Migration from file-based storage to SQLite

-- ═══════════════════════════════════════════════════════════════════════════
-- DEBATES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS debates (
  id TEXT PRIMARY KEY,                    -- "0001_feature-auth"
  team_id TEXT NOT NULL,                  -- "backend" (reference to manifest.json)
  sequence INTEGER NOT NULL,              -- Per-team incremental (1, 2, 3...)
  flow TEXT NOT NULL,                     -- JSON serialized FlowStep[]
  title TEXT NOT NULL,                    -- "feature-auth"
  prompt TEXT NOT NULL,                   -- Original user request
  created_at TEXT NOT NULL,               -- ISO timestamp
  closed_at TEXT,                         -- ISO timestamp (NULL if still running)
  manifest_snapshot TEXT NOT NULL,        -- Full Team object as JSON at debate creation
  UNIQUE(team_id, sequence)
);

CREATE INDEX idx_debates_team_created ON debates(team_id, created_at DESC);
CREATE INDEX idx_debates_closed ON debates(closed_at DESC) WHERE closed_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- DEBATE ENTRIES (Thread)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS debate_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id TEXT NOT NULL,
  author TEXT NOT NULL,                   -- member_id OR "alfred" OR "system"
  timestamp TEXT NOT NULL,                -- ISO timestamp
  content TEXT,                           -- Markdown/text output from agent
  turn_order INTEGER NOT NULL,            -- Reliable ordering (independent of timestamp)
  successful_attempt_id INTEGER,          -- Link to turn_attempts (NULL if no tracking)
  FOREIGN KEY(debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  FOREIGN KEY(successful_attempt_id) REFERENCES turn_attempts(id),
  UNIQUE(debate_id, turn_order)
);

CREATE INDEX idx_debate_entries_debate ON debate_entries(debate_id, turn_order);
CREATE INDEX idx_debate_entries_author ON debate_entries(author);

-- ═══════════════════════════════════════════════════════════════════════════
-- TURN ATTEMPTS (Performance Tracking)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS turn_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id TEXT NOT NULL,
  author TEXT NOT NULL,                   -- member_id or "alfred"
  attempt_number INTEGER NOT NULL,        -- 1, 2, 3... (if retry logic exists)
  started_at TEXT NOT NULL,               -- ISO timestamp
  duration_ms INTEGER,                    -- NULL if still running or failed before completion
  token_input INTEGER,                    -- Prompt tokens
  token_output INTEGER,                   -- Completion tokens
  cache_read_tokens INTEGER,              -- Prompt cache hits (if supported by model)
  cache_write_tokens INTEGER,             -- Prompt cache writes
  error_message TEXT,                     -- NULL if success
  exit_code INTEGER,                      -- 0 = success, 1 = error, 2 = timeout, etc.
  success BOOLEAN NOT NULL,               -- true if this attempt succeeded
  FOREIGN KEY(debate_id) REFERENCES debates(id) ON DELETE CASCADE
);

CREATE INDEX idx_turn_attempts_debate ON turn_attempts(debate_id, author, started_at);
CREATE INDEX idx_turn_attempts_author ON turn_attempts(author, started_at DESC);
CREATE INDEX idx_turn_attempts_errors ON turn_attempts(success, error_message) WHERE NOT success;

-- ═══════════════════════════════════════════════════════════════════════════
-- FULL-TEXT SEARCH (FTS5)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE VIRTUAL TABLE IF NOT EXISTS debate_fts USING fts5(
  debate_id UNINDEXED,
  author UNINDEXED,
  content,
  tokenize='porter unicode61'
);

-- Note: FTS5 is populated MANUALLY in code after main transaction commits
-- to avoid consistency issues if trigger fails.

-- ═══════════════════════════════════════════════════════════════════════════
-- PRAGMAS (Performance & Safety)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable foreign key constraints (off by default in SQLite)
PRAGMA foreign_keys = ON;

-- WAL mode for better concurrent read performance (if needed)
-- PRAGMA journal_mode = WAL;

-- Synchronous=NORMAL is safe for local dev (FULL for production)
PRAGMA synchronous = NORMAL;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION METADATA
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT
);

INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (1, datetime('now'), 'Initial schema: debates, entries, attempts, FTS5');
