import { DatabaseSync } from "node:sqlite";
import * as path from "node:path";
import type { Debate, DebateEntry, DebateRow, DebateEntryRow } from "./types.js";

export interface MemberStats {
  author: string;
  turns: number;
  avg_duration_ms: number | null;
  error_count: number;
}

export interface DebateStats {
  total_entries: number;
  total_duration_ms: number | null;
  avg_duration_ms: number | null;
  error_count: number;
}

export interface DebateSummary {
  id: string;
  sequence: number;
  title: string;
  created_at: string;
  closed_at: string | null;
  entry_count: number;
  total_duration_ms: number | null;
}

export class AlfredDatabase {
  private db: DatabaseSync;

  constructor(private readonly root: string) {
    const dbPath = path.join(this.root, ".alfred", "alfred.db");
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");

    const versionRow = this.db.prepare("PRAGMA user_version").get() as { user_version: number };

    if (versionRow.user_version === 0) {
      this.db.exec(`
        CREATE TABLE debates (
          id TEXT PRIMARY KEY,
          team TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          flow TEXT NOT NULL,
          request_title TEXT NOT NULL,
          request_prompt TEXT NOT NULL,
          created_at TEXT NOT NULL,
          closed_at TEXT,
          status TEXT NOT NULL DEFAULT 'running',
          last_heartbeat TEXT,
          worker_pid INTEGER,
          UNIQUE(team, sequence),
          CHECK(created_at IS NOT NULL)
        );

        CREATE TABLE debate_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          debate_id TEXT NOT NULL,
          author TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          content TEXT NOT NULL,
          duration_ms INTEGER,
          exit_code INTEGER,
          error_message TEXT,
          flow_step_id TEXT,
          FOREIGN KEY(debate_id) REFERENCES debates(id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE debate_entries_fts USING fts5(
          debate_id UNINDEXED,
          author UNINDEXED,
          content,
          content=debate_entries,
          content_rowid=id
        );

        CREATE TRIGGER debate_entries_ai AFTER INSERT ON debate_entries BEGIN
          INSERT INTO debate_entries_fts(rowid, debate_id, author, content)
          VALUES (new.id, new.debate_id, new.author, new.content);
        END;

        CREATE TRIGGER debate_entries_ad AFTER DELETE ON debate_entries BEGIN
          DELETE FROM debate_entries_fts WHERE rowid = old.id;
        END;

        CREATE INDEX idx_debate_entries_debate_id ON debate_entries(debate_id);
        CREATE INDEX idx_debates_team_sequence ON debates(team, sequence DESC);
        CREATE INDEX idx_debates_created_at ON debates(created_at DESC);
      `);
      this.db.exec("PRAGMA user_version = 2");
    }
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async withTransaction<T>(fn: () => T): Promise<T> {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  createDebate(debate: Omit<Debate, "id" | "sequence">): { id: string; sequence: number } {
    // We use a manual transaction here because DatabaseSync is synchronous, 
    // but we want the atomicity of Sequence + Insert.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const sequence = this.getNextSequence(debate.team);
      const title = debate.request.title;
      const id = `${String(sequence).padStart(4, "0")}_${title}`;

      this.db.prepare(`
        INSERT INTO debates (
          id, team, sequence, flow, request_title, request_prompt,
          created_at, closed_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        debate.team,
        sequence,
        JSON.stringify(debate.flow),
        debate.request.title,
        debate.request.prompt,
        debate.createdAt,
        debate.closedAt ?? null,
        "running",
      );

      this.db.exec("COMMIT");
      return { id, sequence };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  insertTurn(debateId: string, entry: DebateEntry, flowStepId: string | null = null): void {
    const perf = entry.performance;
    this.db.prepare(`
      INSERT INTO debate_entries (
        debate_id, author, timestamp, content,
        duration_ms, exit_code, error_message, flow_step_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      debateId,
      entry.author,
      entry.timestamp,
      entry.content ?? "",
      perf?.duration_ms ?? null,
      perf?.exit_code ?? null,
      perf?.error ?? null,
      flowStepId,
    );
  }

  markDebateClosed(debateId: string, closedAt: string, status: "completed" | "failed" = "completed"): void {
    this.db.prepare(`
      UPDATE debates SET closed_at = ?, status = ? WHERE id = ?
    `).run(closedAt, status, debateId);
  }

  updateDebateStatus(debateId: string, status: "running" | "completed" | "failed" | "paused"): void {
    this.db.prepare(`
      UPDATE debates SET status = ? WHERE id = ?
    `).run(status, debateId);
  }

  updateWorkerPid(debateId: string, pid: number): void {
    this.db.prepare(`
      UPDATE debates SET worker_pid = ? WHERE id = ?
    `).run(pid, debateId);
  }

  updateHeartbeat(debateId: string): void {
    this.db.prepare(`
      UPDATE debates SET last_heartbeat = ? WHERE id = ?
    `).run(new Date().toISOString(), debateId);
  }

  markStaleDebatesFailed(staleThresholdMs = 5 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - staleThresholdMs).toISOString();
    this.db.prepare(`
      UPDATE debates SET status = 'failed', closed_at = ?
      WHERE status = 'running'
        AND last_heartbeat IS NOT NULL
        AND last_heartbeat < ?
    `).run(new Date().toISOString(), cutoff);
  }

  getNextSequence(teamName: string): number {
    const row = this.db.prepare(`
      SELECT IFNULL(MAX(sequence), 0) + 1 AS next_seq
      FROM debates
      WHERE team = ?
    `).get(teamName) as { next_seq: number };
    return row.next_seq;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  getDebateMetadata(debateId: string): DebateRow | undefined {
    return this.db.prepare(`
      SELECT id, team, sequence, flow, request_title, request_prompt,
             created_at, closed_at, status, last_heartbeat, worker_pid
      FROM debates WHERE id = ?
    `).get(debateId) as DebateRow | undefined;
  }

  getDebateEntries(debateId: string): DebateEntryRow[] {
    return this.db.prepare(`
      SELECT id, debate_id, author, timestamp, content, duration_ms, exit_code, error_message, flow_step_id
      FROM debate_entries WHERE debate_id = ? ORDER BY id ASC
    `).all(debateId) as unknown as DebateEntryRow[];
  }

  reloadDebate(debateId: string): Debate | null {
    const meta = this.getDebateMetadata(debateId);
    if (!meta) return null;

    const entries = this.getDebateEntries(debateId);

    return {
      id: meta.id,
      team: meta.team,
      sequence: meta.sequence,
      flow: JSON.parse(meta.flow),
      request: {
        title: meta.request_title,
        prompt: meta.request_prompt,
      },
      createdAt: meta.created_at,
      closedAt: meta.closed_at ?? undefined,
      thread: entries.map((e) => ({
        author: e.author,
        timestamp: e.timestamp,
        content: e.content,
        performance: {
          duration_ms: e.duration_ms ?? 0,
          exit_code: e.exit_code ?? 0,
          error: e.error_message ?? undefined,
        },
      })),
    };
  }

  getMemberStats(debateId: string): MemberStats[] {
    return this.db.prepare(`
      SELECT
        author,
        COUNT(*) AS turns,
        ROUND(AVG(duration_ms), 2) AS avg_duration_ms,
        COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) AS error_count
      FROM debate_entries WHERE debate_id = ?
      GROUP BY author ORDER BY turns DESC
    `).all(debateId) as unknown as MemberStats[];
  }

  getDebateStats(debateId: string): DebateStats {
    return this.db.prepare(`
      SELECT
        COUNT(*) AS total_entries,
        ROUND(SUM(duration_ms), 2) AS total_duration_ms,
        ROUND(AVG(duration_ms), 2) AS avg_duration_ms,
        COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) AS error_count
      FROM debate_entries WHERE debate_id = ?
    `).get(debateId) as unknown as DebateStats;
  }

  getTeamDebates(team: string, limit = 50): DebateSummary[] {
    return this.db.prepare(`
      SELECT
        d.id, d.sequence, d.request_title AS title,
        d.created_at, d.closed_at,
        COUNT(de.id) AS entry_count,
        ROUND(SUM(de.duration_ms), 2) AS total_duration_ms
      FROM debates d
      LEFT JOIN debate_entries de ON d.id = de.debate_id
      WHERE d.team = ?
      GROUP BY d.id
      ORDER BY d.created_at DESC
      LIMIT ?
    `).all(team, limit) as unknown as DebateSummary[];
  }

  searchDebates(query: string, limit = 20): Array<{ debate_id: string; author: string; content: string; timestamp: string }> {
    return this.db.prepare(`
      SELECT fts.debate_id, de.author, de.content, de.timestamp
      FROM debate_entries_fts fts
      JOIN debate_entries de ON fts.rowid = de.id
      WHERE debate_entries_fts MATCH ?
      ORDER BY rank DESC LIMIT ?
    `).all(query, limit) as unknown as Array<{ debate_id: string; author: string; content: string; timestamp: string }>;
  }

  getCompletedFlowSteps(debateId: string): string[] {
    return this.db.prepare(`
      SELECT flow_step_id FROM debate_entries 
      WHERE debate_id = ? AND flow_step_id IS NOT NULL
    `).all(debateId).map(row => (row as any).flow_step_id);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
