/**
 * db.ts — SQLite Database Layer for Alfred
 * 
 * CRITICAL: This module handles multi-process concurrency via transaction retry.
 * See CRITICAL_ANALYSIS.md for full rationale.
 */

import { DatabaseSync } from "node:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";
import type { Debate, Team } from "./types.js";
import { alfredDir } from "./fs.js";

// ═══════════════════════════════════════════════════════════════════════════
// Database Initialization
// ═══════════════════════════════════════════════════════════════════════════

let _dbCache: Map<string, DatabaseSync> | null = null;

/**
 * Get or create database handle for a project.
 * Lazy initialization with schema creation.
 */
export function getDB(projectRoot: string): DatabaseSync {
  if (!_dbCache) _dbCache = new Map();
  
  const cached = _dbCache.get(projectRoot);
  if (cached) return cached;

  const dbPath = path.join(alfredDir(projectRoot), "alfred.db");
  const isNew = !fs.existsSync(dbPath);

  const db = new DatabaseSync(dbPath);
  
  if (isNew) {
    initializeSchema(db);
  }

  _dbCache.set(projectRoot, db);
  return db;
}

/**
 * Initialize database schema from schema.sql.
 * Called only on first DB creation.
 */
function initializeSchema(db: DatabaseSync): void {
  const schemaSQL = fs.readFileSync(
    path.join(__dirname, "../docs/migration/schema.sql"),
    "utf-8"
  );
  
  db.exec(schemaSQL);
}

/**
 * Close all database connections (for cleanup/testing).
 */
export function closeAllDBs(): void {
  if (!_dbCache) return;
  for (const db of _dbCache.values()) {
    db.close();
  }
  _dbCache.clear();
  _dbCache = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Transaction Wrapper (Multi-Process Safe)
// ═══════════════════════════════════════════════════════════════════════════

export interface TransactionOptions {
  maxRetries?: number;      // default: 5
  initialDelayMs?: number;  // default: 50
  maxDelayMs?: number;      // default: 1000
}

/**
 * Execute a function within a SQLite transaction with automatic retry on lock errors.
 * 
 * CRITICAL: This prevents data loss when multiple alfred_run instances collide.
 * Uses exponential backoff to avoid thundering herd.
 * 
 * @throws Error if all retries fail or non-lock error occurs
 */
export function withTransaction<T>(
  db: DatabaseSync,
  fn: () => T,
  options: TransactionOptions = {}
): T {
  const {
    maxRetries = 5,
    initialDelayMs = 50,
    maxDelayMs = 1000
  } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // IMMEDIATE = acquire write lock immediately (fail fast if locked)
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      
      const result = fn();
      
      db.exec('COMMIT');
      return result;
      
    } catch (err: any) {
      // Always try to rollback, ignore if already rolled back
      try { db.exec('ROLLBACK'); } catch {}
      
      // Check if this is a lock error (SQLITE_BUSY)
      const isLockError = 
        err?.code === 'ERR_SQLITE_ERROR' && 
        (err?.message?.includes('locked') || err?.message?.includes('busy'));
      
      if (!isLockError) {
        // Non-lock error = abort immediately
        throw err;
      }
      
      if (attempt === maxRetries - 1) {
        // Last attempt failed
        throw new Error(
          `Transaction failed after ${maxRetries} retries: ${err.message}. ` +
          `This may indicate concurrent alfred_run processes on the same project.`
        );
      }
      
      // Exponential backoff with jitter
      const baseDelay = initialDelayMs * (2 ** attempt);
      const jitter = Math.random() * 0.3 * baseDelay; // ±30% jitter
      const delayMs = Math.min(baseDelay + jitter, maxDelayMs);
      
      // Synchronous sleep (yes, blocking event loop, but necessary for retry)
      const buffer = new SharedArrayBuffer(4);
      const view = new Int32Array(buffer);
      Atomics.wait(view, 0, 0, delayMs);
    }
  }
  
  throw new Error('Transaction failed: max retries exceeded');
}

// ═══════════════════════════════════════════════════════════════════════════
// Debate Persistence
// ═══════════════════════════════════════════════════════════════════════════

export interface SaveDebateOptions {
  team: Team;  // Full team manifest snapshot
  turnOrder: number[];  // Maps thread index → turn_order
}

/**
 * Save a complete debate to the database.
 * Replaces fs.ts:saveDebate().
 */
export function saveDebateToDB(
  db: DatabaseSync,
  debate: Debate,
  options: SaveDebateOptions
): void {
  withTransaction(db, () => {
    // 1. Insert debate metadata
    db.prepare(`
      INSERT INTO debates (
        id, team_id, sequence, flow, title, prompt, 
        created_at, closed_at, manifest_snapshot
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        closed_at = excluded.closed_at
    `).run(
      debate.id,
      debate.team,
      debate.sequence,
      JSON.stringify(debate.flow),
      debate.request.title,
      debate.request.prompt,
      debate.createdAt,
      debate.closedAt ?? null,
      JSON.stringify(options.team)
    );

    // 2. Insert debate entries
    const insertEntry = db.prepare(`
      INSERT INTO debate_entries (
        debate_id, author, timestamp, content, turn_order
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < debate.thread.length; i++) {
      const entry = debate.thread[i];
      if (!entry) continue;
      
      insertEntry.run(
        debate.id,
        entry.author,
        entry.timestamp,
        entry.content ?? "",
        options.turnOrder[i] ?? i  // Fallback to index if turnOrder missing
      );
    }
  });

  // 3. Populate FTS5 AFTER main transaction commits
  // (Avoids inconsistency if FTS trigger fails)
  try {
    populateFTS(db, debate.id);
  } catch (err) {
    console.warn(`[WARN] FTS5 population failed for ${debate.id}:`, err);
    // Non-fatal: debate is saved, just not searchable
  }
}

/**
 * Populate FTS5 index for a specific debate.
 * Called separately to avoid transaction rollback if FTS fails.
 */
function populateFTS(db: DatabaseSync, debateId: string): void {
  const entries = db.prepare(`
    SELECT id, debate_id, author, content
    FROM debate_entries
    WHERE debate_id = ?
  `).all(debateId) as Array<{
    id: number;
    debate_id: string;
    author: string;
    content: string;
  }>;

  const insertFTS = db.prepare(`
    INSERT INTO debate_fts (rowid, debate_id, author, content)
    VALUES (?, ?, ?, ?)
  `);

  for (const entry of entries) {
    if (!entry.content) continue;
    insertFTS.run(entry.id, entry.debate_id, entry.author, entry.content);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Performance Tracking
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnAttempt {
  debateId: string;
  author: string;
  attemptNumber: number;
  startedAt: string;
  durationMs?: number;
  tokenInput?: number;
  tokenOutput?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  errorMessage?: string;
  exitCode: number;
  success: boolean;
}

/**
 * Record a turn attempt (for performance tracking and retry visibility).
 */
export function recordTurnAttempt(
  db: DatabaseSync,
  attempt: TurnAttempt
): number {
  const result = db.prepare(`
    INSERT INTO turn_attempts (
      debate_id, author, attempt_number, started_at,
      duration_ms, token_input, token_output,
      cache_read_tokens, cache_write_tokens,
      error_message, exit_code, success
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    attempt.debateId,
    attempt.author,
    attempt.attemptNumber,
    attempt.startedAt,
    attempt.durationMs ?? null,
    attempt.tokenInput ?? null,
    attempt.tokenOutput ?? null,
    attempt.cacheReadTokens ?? null,
    attempt.cacheWriteTokens ?? null,
    attempt.errorMessage ?? null,
    attempt.exitCode,
    attempt.success ? 1 : 0
  );

  return result.lastInsertRowid as number;
}

/**
 * Link a successful attempt to its debate entry.
 */
export function linkSuccessfulAttempt(
  db: DatabaseSync,
  debateId: string,
  turnOrder: number,
  attemptId: number
): void {
  db.prepare(`
    UPDATE debate_entries
    SET successful_attempt_id = ?
    WHERE debate_id = ? AND turn_order = ?
  `).run(attemptId, debateId, turnOrder);
}

// ═══════════════════════════════════════════════════════════════════════════
// Query Helpers
// ═══════════════════════════════════════════════════════════════════════════

export interface DebateStats {
  debateId: string;
  teamId: string;
  totalTurns: number;
  totalDurationMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
  errorCount: number;
}

/**
 * Get aggregate stats for a specific debate.
 */
export function getDebateStats(db: DatabaseSync, debateId: string): DebateStats | null {
  const row = db.prepare(`
    SELECT
      d.id as debate_id,
      d.team_id,
      COUNT(de.id) as total_turns,
      COALESCE(SUM(ta.duration_ms), 0) as total_duration_ms,
      COALESCE(SUM(ta.token_input), 0) as total_tokens_in,
      COALESCE(SUM(ta.token_output), 0) as total_tokens_out,
      COUNT(CASE WHEN ta.success = 0 THEN 1 END) as error_count
    FROM debates d
    LEFT JOIN debate_entries de ON d.id = de.debate_id
    LEFT JOIN turn_attempts ta ON de.successful_attempt_id = ta.id
    WHERE d.id = ?
    GROUP BY d.id
  `).get(debateId);

  return row as DebateStats | null;
}

/**
 * Full-text search across all debates.
 */
export function searchDebates(
  db: DatabaseSync,
  query: string,
  limit: number = 20
): Array<{ debateId: string; author: string; snippet: string }> {
  return db.prepare(`
    SELECT
      debate_id,
      author,
      snippet(debate_fts, 2, '<mark>', '</mark>', '...', 32) as snippet
    FROM debate_fts
    WHERE content MATCH ?
    LIMIT ?
  `).all(query, limit) as any[];
}
