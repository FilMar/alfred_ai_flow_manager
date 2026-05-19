import * as fs from "node:fs/promises";
import * as path from "node:path";
export function alfredDir(projectRoot) {
    return path.join(projectRoot, ".alfred");
}
export async function loadProject(projectRoot) {
    const file = path.join(alfredDir(projectRoot), "alfred_project.json");
    return JSON.parse(await fs.readFile(file, "utf-8"));
}
export async function saveProject(projectRoot, project) {
    await fs.mkdir(alfredDir(projectRoot), { recursive: true });
    await fs.writeFile(path.join(alfredDir(projectRoot), "alfred_project.json"), JSON.stringify(project, null, 2));
}
export async function loadTeam(projectRoot, teamName) {
    const file = path.join(alfredDir(projectRoot), "teams", teamName, "manifest.json");
    return JSON.parse(await fs.readFile(file, "utf-8"));
}
export async function saveTeam(projectRoot, team) {
    const dir = path.join(alfredDir(projectRoot), "teams", team.name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(team, null, 2));
}
export async function listTeams(projectRoot) {
    const teamsDir = path.join(alfredDir(projectRoot), "teams");
    try {
        const entries = await fs.readdir(teamsDir, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    }
    catch {
        return [];
    }
}
export function formatThread(debate) {
    return debate.thread
        .filter((e) => e.content)
        .map((e) => `## ${e.author} — ${e.timestamp}\n\n${e.content}`)
        .join("\n\n---\n\n");
}
export async function saveDebate(projectRoot, debate) {
    const dir = path.join(alfredDir(projectRoot), "debates", debate.id);
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
export async function loadDebate(projectRoot, debateId) {
    const file = path.join(alfredDir(projectRoot), "debates", debateId, "debate.json");
    return JSON.parse(await fs.readFile(file, "utf-8"));
}
