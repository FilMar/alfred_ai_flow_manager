import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AlfredProject, Debate, Team } from "./types.js";

export class AlfredStorage {
  constructor(private readonly root: string) {}

  private get alfredDir(): string {
    return path.join(this.root, ".alfred");
  }

  private async writeAtomicJson(filePath: string, data: unknown): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.rename(tempPath, filePath);
    } catch (err) {
      try {
        await fs.unlink(tempPath);
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  async loadProject(): Promise<AlfredProject> {
    const filePath = path.join(this.alfredDir, "alfred_project.json");
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as AlfredProject & { teams?: string[] };
    const { teams: _ignoredTeams, ...project } = data;
    return project;
  }

  async saveProject(project: AlfredProject): Promise<void> {
    await fs.mkdir(this.alfredDir, { recursive: true });
    await this.writeAtomicJson(path.join(this.alfredDir, "alfred_project.json"), project);
  }

  async loadTeam(teamName: string): Promise<Team> {
    const filePath = path.join(this.alfredDir, "teams", `${this.sanitizeSegment(teamName)}.json`);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as Team;
  }

  async saveTeam(team: Team): Promise<void> {
    const teamsDir = path.join(this.alfredDir, "teams");
    await fs.mkdir(teamsDir, { recursive: true });
    const filePath = path.join(teamsDir, `${this.sanitizeSegment(team.name)}.json`);
    await this.writeAtomicJson(filePath, team);
  }

  async listTeams(): Promise<string[]> {
    const teamsDir = path.join(this.alfredDir, "teams");
    try {
      const entries = await fs.readdir(teamsDir);
      return entries
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.replace(".json", ""));
    } catch {
      return [];
    }
  }

  private sanitizeSegment(name: string): string {
    return name.replace(/[^a-zA-Z0-9_\-.]/g, "_");
  }

  static formatThread(debate: Debate, truncateTimestamp = false): string {
    return debate.thread
      .filter((e) => e.content)
      .map((e) => {
        const ts = truncateTimestamp ? e.timestamp.slice(0, 16) : e.timestamp;
        return `## ${e.author} — ${ts}\n\n${e.content}`;
      })
      .join("\n\n---\n\n");
  }
}
