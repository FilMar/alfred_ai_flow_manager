import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { Task, Project, List } from "./types.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_PATH = process.env.TD_DB_PATH ?? join(homedir(), ".pi", "td.db");

// ─── Setup ───────────────────────────────────────────────────────────────────

function open(): Database {
  mkdirSync(join(DB_PATH, ".."), { recursive: true });
  const db = new Database(DB_PATH, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      start    TEXT NOT NULL,
      goal_end TEXT,
      real_end TEXT,
      data     TEXT NOT NULL DEFAULT '{}'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT PRIMARY KEY,
      list       TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id),
      done_at    TEXT,
      created_at TEXT NOT NULL,
      data       TEXT NOT NULL DEFAULT '{}'
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done_at)");
}

const db = open();

// ─── Projects ────────────────────────────────────────────────────────────────

export function insertProject(p: Project): void {
  db.run(
    "INSERT INTO projects (id, name, start, goal_end, real_end, data) VALUES (?, ?, ?, ?, ?, ?)",
    [p.id, p.name, p.start, p.goal_end ?? null, p.real_end ?? null, JSON.stringify(p.data)]
  );
}

export function getProject(id: string): Project | null {
  const row = db.query("SELECT * FROM projects WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? rowToProject(row) : null;
}

export function getProjectByName(name: string): Project | null {
  const row = db.query("SELECT * FROM projects WHERE name = ? COLLATE NOCASE").get(name) as Record<string, unknown> | null;
  return row ? rowToProject(row) : null;
}

export function listProjects(includeCompleted = false): Project[] {
  const q = includeCompleted
    ? "SELECT * FROM projects ORDER BY start DESC"
    : "SELECT * FROM projects WHERE real_end IS NULL ORDER BY start DESC";
  return (db.query(q).all() as Record<string, unknown>[]).map(rowToProject);
}

export function updateProject(id: string, fields: Partial<Pick<Project, "name" | "goal_end" | "real_end" | "data">>): void {
  if (fields.name !== undefined) db.run("UPDATE projects SET name = ? WHERE id = ?", [fields.name, id]);
  if (fields.goal_end !== undefined) db.run("UPDATE projects SET goal_end = ? WHERE id = ?", [fields.goal_end, id]);
  if (fields.real_end !== undefined) db.run("UPDATE projects SET real_end = ? WHERE id = ?", [fields.real_end, id]);
  if (fields.data !== undefined) db.run("UPDATE projects SET data = ? WHERE id = ?", [JSON.stringify(fields.data), id]);
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    start: row.start as string,
    goal_end: row.goal_end as string | undefined,
    real_end: row.real_end as string | undefined,
    data: JSON.parse(row.data as string),
  };
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export function insertTask(t: Task): void {
  db.run(
    "INSERT INTO tasks (id, list, project_id, done_at, created_at, data) VALUES (?, ?, ?, ?, ?, ?)",
    [t.id, t.list, t.project_id ?? null, t.done_at ?? null, t.created_at, JSON.stringify(t.data)]
  );
}

export function getTask(id: string): Task | null {
  const row = db.query("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | null;
  return row ? rowToTask(row) : null;
}

export function listTasks(opts: { list?: List; project_id?: string; includeDone?: boolean } = {}): Task[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!opts.includeDone) { conditions.push("done_at IS NULL"); }
  if (opts.list) { conditions.push("list = ?"); params.push(opts.list); }
  if (opts.project_id) { conditions.push("project_id = ?"); params.push(opts.project_id); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return (db.query(`SELECT * FROM tasks ${where} ORDER BY created_at ASC`).all(...params) as Record<string, unknown>[]).map(rowToTask);
}

export function moveTask(id: string, list: List): void {
  db.run("UPDATE tasks SET list = ? WHERE id = ?", [list, id]);
}

export function doneTask(id: string): void {
  db.run("UPDATE tasks SET done_at = ? WHERE id = ?", [new Date().toISOString(), id]);
}

export function updateTaskData(id: string, data: Record<string, unknown>): void {
  db.run("UPDATE tasks SET data = ? WHERE id = ?", [JSON.stringify(data), id]);
}

export function searchTasks(query: string, opts: { includeDone?: boolean } = {}): Task[] {
  const conditions: string[] = ["data LIKE ?"];
  const params: unknown[] = [`%${query}%`];
  if (!opts.includeDone) conditions.push("done_at IS NULL");
  const where = `WHERE ${conditions.join(" AND ")}`;
  return (db.query(`SELECT * FROM tasks ${where} ORDER BY created_at ASC`).all(...params) as Record<string, unknown>[]).map(rowToTask);
}

export function taskCountByProject(projectId: string): { active: number; done: number } {
  const active = (db.query("SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND done_at IS NULL").get(projectId) as { n: number }).n;
  const done = (db.query("SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND done_at IS NOT NULL").get(projectId) as { n: number }).n;
  return { active, done };
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    list: row.list as List,
    project_id: row.project_id as string | undefined,
    done_at: row.done_at as string | undefined,
    created_at: row.created_at as string,
    data: JSON.parse(row.data as string),
  };
}
