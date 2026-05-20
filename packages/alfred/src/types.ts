// ─── Hats ────────────────────────────────────────────────────────────────────

export const HAT_IDS = ["white-core", "red-core", "black-core", "yellow-core", "green-core", "blue-core"] as const;
export type HatId = (typeof HAT_IDS)[number];

// ─── Tools ───────────────────────────────────────────────────────────────────

export const TOOL_IDS = ["read", "write", "edit", "bash", "grep", "find", "web_search", "web_fetch"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

// ─── Team Member ─────────────────────────────────────────────────────────────

export interface TeamMember {
  /** Unique identifier within the team, used for @addressing */
  id: string;
  /** Cognitive protocol — maps to a hat file in hats/ */
  hat: HatId;
  /** Professional role label */
  role: string;
  /** Short description blending hat + role in team context */
  personality: string;
  /** LLM model assigned to this member */
  model: string;
  /** Minimal set of tools this member may call */
  tools: ToolId[];
  /**
   * Skill che il membro può invocare.
   * @todo Supporto futuro: resolver da nome a path file, passare via --skill <path>.
   */
  skills?: string[];
  /**
   * Cap hard sul numero di tool call per turno.
   * @todo Supporto futuro: iniettare come istruzione nel system prompt del subprocess.
   */
  maxToolCalls?: number;
}

// ─── Team ────────────────────────────────────────────────────────────────────

export interface Team {
  name: string;
  description: string;
  members: TeamMember[];
}

// ─── Project ─────────────────────────────────────────────────────────────────

export interface AlfredProject {
  name: string;
  description: string;
  /** Names of active teams — each maps to teams/<name>/manifest.json */
  teams: string[];
  created: string; // ISO date
}

// ─── Flow ────────────────────────────────────────────────────────────────────

/**
 * Recursive flow descriptor.
 *
 * - string         → single member id (sequential step)
 * - FlowStep[]     → parallel group (all run concurrently, results appended in order)
 * - RoundtableNode → members take turns seeing the growing thread, for N rounds
 *
 * Top-level Flow is sequential: each element runs after the previous.
 *
 * Examples:
 *   ["a", "b", "c"]                           → a → b → c
 *   ["a", ["b", "c"], "d"]                    → a → (b ∥ c) → d
 *   [{ roundtable: ["x","y","z"], rounds: 2 }] → 2 full rounds of x → y → z
 */
export interface RoundtableNode {
  roundtable: string[];
  rounds?: number; // default 1
}

export type FlowStep = string | string[] | RoundtableNode;

export type Flow = FlowStep[];

// ─── Debate ──────────────────────────────────────────────────────────────────

export interface DebateEntry {
  /** Member id or "alfred" for the orchestrator */
  author: string;
  /** ISO timestamp */
  timestamp: string;
  /** Present in memory during execution, stripped from debate.json (transcript lives in thread.md) */
  content?: string;
}

export interface Debate {
  /** Slug used as directory name, e.g. "2026-05-19_feature-auth" */
  id: string;
  /** Name of the team involved */
  team: string;
  flow: Flow;
  /** Original task as given to Alfred */
  task: string;
  thread: DebateEntry[];
  /** Sintesi del debate prodotta dall'orchestratore dopo la lettura del thread. Non scritta dall'engine. */
  summary?: string;
  /** Timestamp ISO impostato quando il debate viene finalizzato. Non ancora scritto dall'engine. */
  closedAt?: string;
}

// ─── Runtime ─────────────────────────────────────────────────────────────────

export interface AgentTurnResult {
  memberId: string;
  output: string;
  exitCode: number;
}
