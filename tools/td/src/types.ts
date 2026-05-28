// ─── Liste GTD ────────────────────────────────────────────────────────────────

export const LISTS = ["inbox", "next", "project", "waiting", "someday"] as const;
export type List = (typeof LISTS)[number];

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  start: string;
  goal_end?: string;
  real_end?: string;
  data: Record<string, unknown>;
}

// ─── Task ────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  list: List;
  project_id?: string;
  done_at?: string;
  created_at: string;
  data: Record<string, unknown>;
}
