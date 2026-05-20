import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AlfredProject, Team, Debate } from "./types.js";

export function alfredDir(projectRoot: string): string {
  return path.join(projectRoot, ".alfred");
}

export async function loadProject(projectRoot: string): Promise<AlfredProject> {
  const file = path.join(alfredDir(projectRoot), "alfred_project.json");
  return JSON.parse(await fs.readFile(file, "utf-8")) as AlfredProject;
}

export async function saveProject(projectRoot: string, project: AlfredProject): Promise<void> {
  await fs.mkdir(alfredDir(projectRoot), { recursive: true });
  await fs.writeFile(
    path.join(alfredDir(projectRoot), "alfred_project.json"),
    JSON.stringify(project, null, 2),
  );
}

export async function loadTeam(projectRoot: string, teamName: string): Promise<Team> {
  const file = path.join(alfredDir(projectRoot), "teams", sanitizeSegment(teamName), "manifest.json");
  return JSON.parse(await fs.readFile(file, "utf-8")) as Team;
}

export async function saveTeam(projectRoot: string, team: Team): Promise<void> {
  const dir = path.join(alfredDir(projectRoot), "teams", team.name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(team, null, 2));
}

export async function listTeams(projectRoot: string): Promise<string[]> {
  const teamsDir = path.join(alfredDir(projectRoot), "teams");
  try {
    const entries = await fs.readdir(teamsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Sanitizza un segmento di path: rimuove caratteri che permetterebbero traversal.
 * Usato per team name e debate id prima di costruire path su disco.
 */
function sanitizeSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

export function formatThread(debate: Debate, truncateTimestamp = false): string {
  return debate.thread
    .filter((e) => e.content)
    .map((e) => {
      const ts = truncateTimestamp ? e.timestamp.slice(0, 16) : e.timestamp;
      return `## ${e.author} — ${ts}\n\n${e.content}`;
    })
    .join("\n\n---\n\n");
}

export async function saveDebate(projectRoot: string, debate: Debate): Promise<void> {
  const dir = path.join(
    alfredDir(projectRoot),
    "teams",
    sanitizeSegment(debate.team),
    "debates",
    sanitizeSegment(debate.id),
  );
  await fs.mkdir(dir, { recursive: true });

  const header = `# Debate: ${debate.id}\n\n**Task:** ${debate.task}\n\n---\n\n`;
  await fs.writeFile(path.join(dir, "thread.md"), header + formatThread(debate));

  if (debate.summary) {
    await fs.writeFile(path.join(dir, "summary.md"), debate.summary);
  }

  const meta = {
    ...debate,
    thread: debate.thread.map(({ author, timestamp }) => ({ author, timestamp })),
  };
  await fs.writeFile(path.join(dir, "debate.json"), JSON.stringify(meta, null, 2));
}

export async function loadDebate(projectRoot: string, teamName: string, debateId: string): Promise<Debate> {
  const file = path.join(alfredDir(projectRoot), "teams", sanitizeSegment(teamName), "debates", sanitizeSegment(debateId), "debate.json");
  return JSON.parse(await fs.readFile(file, "utf-8")) as Debate;
}
