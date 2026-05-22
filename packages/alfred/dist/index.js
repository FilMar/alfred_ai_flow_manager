import { existsSync } from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { Type } from "typebox";
import { HAT_IDS, TOOL_IDS, validateTeamName } from "./types.js";
import { AlfredProject } from "./AlfredProject.js";
import { textResponse, errorResponse } from "./responses.js";
// ─── Parametri comuni ────────────────────────────────────────────────────────
/** `projectRoot` è richiesto da tutti i tool — definito una volta sola. */
const projectRootParam = Type.String({
    description: "Absolute path to the project root containing .alfred/",
});
/** Schema TypeBox per HatId e ToolId derivati dalle const arrays */
const HatIdSchema = Type.Union(HAT_IDS.map((h) => Type.Literal(h)));
const ToolIdSchema = Type.Union(TOOL_IDS.map((t) => Type.Literal(t)));
/** Schema TypeBox per RoundtableNode */
const RoundtableStepSchema = Type.Object({
    roundtable: Type.Array(Type.String(), { minItems: 1 }),
    rounds: Type.Optional(Type.Number({ minimum: 1 })),
});
/** Schema TypeBox per FlowStep (non ricorsivo) */
const FlowStepSchema = Type.Union([
    Type.String(),
    Type.Array(Type.String()),
    RoundtableStepSchema,
]);
/** Schema TypeBox per un membro del team — speculare a TeamMember in types.ts. */
const TeamMemberSchema = Type.Object({
    id: Type.String({ description: "Unique identifier within the team (used in flows and @addressing)" }),
    hat: HatIdSchema,
    role: Type.String(),
    personality: Type.String(),
    model: Type.String(),
    tools: Type.Array(ToolIdSchema),
    skills: Type.Optional(Type.Array(Type.String())),
    maxToolCalls: Type.Optional(Type.Number()),
});
function slugifyDebateTitle(task) {
    return task
        .slice(0, 40)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()
        .replace(/^-|-$/g, "") || "debate";
}
// ─── Extension ───────────────────────────────────────────────────────────────
export default function registerAlfredExtension(pi) {
    // ─── alfred_init ───────────────────────────────────────────────────────────
    pi.registerTool({
        name: "alfred_init",
        label: "Alfred Init",
        description: "Initialize an Alfred project in the given directory. Creates .alfred/alfred_project.json. Fails if the project already exists.",
        parameters: Type.Object({
            projectRoot: projectRootParam,
            name: Type.String({ description: "Project name" }),
            description: Type.Optional(Type.String({ description: "Project description" })),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, name, description = "" } = params;
            const project = new AlfredProject(projectRoot);
            const projectFile = path.join(project.root, ".alfred", "alfred_project.json");
            if (existsSync(projectFile)) {
                return errorResponse(`Project already exists at ${projectFile}. Use alfred_teams to inspect it.`);
            }
            const projectData = {
                name,
                description,
                created: new Date().toISOString().slice(0, 10),
            };
            await project.storage.saveProject(projectData);
            project.dispose();
            return textResponse(`Project '${name}' initialized at ${projectRoot}/.alfred/`, { project: projectData });
        },
    });
    // ─── alfred_team_create ───────────────────────────────────────────────────
    pi.registerTool({
        name: "alfred_team_create",
        label: "Alfred Team Create",
        description: `Create a new team in an existing Alfred project. Fails if the team already exists.

Each member requires:
  - id: unique identifier within the team (used in flows and @addressing)
  - hat: cognitive protocol — one of: white-core, red-core, black-core, yellow-core, green-core, blue-core
  - role: professional role label (e.g. "Senior Backend Developer")
  - personality: short description blending hat + role in team context
  - model: LLM model id (e.g. "claude-haiku-4-5", "claude-sonnet-4-6")
  - tools: allowed tool names (e.g. ["read", "grep", "find"])
  - skills: [] (reserved, currently unused)
  - maxToolCalls: 10 (reserved, currently unused)`,
        parameters: Type.Object({
            projectRoot: projectRootParam,
            team: Type.Object({
                name: Type.String({ description: "Team name (used as directory name, no spaces)" }),
                description: Type.String({ description: "What this team is for" }),
                members: Type.Array(TeamMemberSchema, { description: "Team members", minItems: 1 }),
            }),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, team } = params;
            const project = new AlfredProject(projectRoot);
            let validatedTeam;
            try {
                validatedTeam = {
                    ...team,
                    name: validateTeamName(team.name),
                };
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                project.dispose();
                return errorResponse(message);
            }
            const teamFile = path.join(project.root, ".alfred", "teams", `${validatedTeam.name}.json`);
            if (existsSync(teamFile)) {
                project.dispose();
                return errorResponse(`Team '${validatedTeam.name}' already exists at ${teamFile}.`);
            }
            const projectFile = path.join(project.root, ".alfred", "alfred_project.json");
            if (!existsSync(projectFile)) {
                project.dispose();
                return errorResponse(`No Alfred project found at ${projectRoot}. Run alfred_init first.`);
            }
            await project.storage.saveTeam(validatedTeam);
            const members = validatedTeam.members
                .map((m) => `  - ${m.id} (${m.hat}) — ${m.role}`)
                .join("\n");
            project.dispose();
            return textResponse(`Team '${validatedTeam.name}' created with ${validatedTeam.members.length} members:\n${members}`, { team: validatedTeam });
        },
    });
    // ─── alfred_run ───────────────────────────────────────────────────────────
    pi.registerTool({
        name: "alfred_run",
        label: "Alfred Run",
        description: `Orchestrate a team debate on a task. Returns immediately and runs in background.

Flow format (nested array):
  - "member-id"                       → sequential step
  - ["member-a", "member-b"]          → parallel group (same thread snapshot)
  - { roundtable: ["x","y"], rounds: 2 } → roundtable (each sees growing thread)

Example flows:
  ["researcher", "critic", "architect"]
  ["researcher", ["critic", "optimist"], "synthesizer"]
  [{ "roundtable": ["critic", "optimist", "blue-core"], "rounds": 2 }]`,
        parameters: Type.Object({
            projectRoot: projectRootParam,
            team: Type.String({ description: "Team name (must exist in .alfred/teams/)" }),
            flow: Type.Array(FlowStepSchema, { description: "Execution flow descriptor" }),
            task: Type.String({ description: "The task or question for the team" }),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, team: teamName, task } = params;
            const flow = params.flow;
            const project = new AlfredProject(projectRoot);
            let team;
            try {
                team = await project.storage.loadTeam(teamName);
            }
            catch {
                project.dispose();
                return errorResponse(`Team '${teamName}' not found in ${projectRoot}/.alfred/teams/`);
            }
            const title = slugifyDebateTitle(task);
            const debateData = {
                team: teamName,
                flow,
                request: {
                    title,
                    prompt: task,
                },
                thread: [],
                createdAt: new Date().toISOString(),
            };
            const db = await project.getDatabase();
            const { id: debateId, sequence } = db.createDebate(debateData);
            try {
                // Spawn detached worker process
                const workerPath = path.join(projectRoot, "packages/alfred/dist/worker.js");
                const args = [
                    projectRoot,
                    teamName,
                    debateId,
                    task,
                    JSON.stringify(flow),
                ];
                const child = spawn("node", [workerPath, ...args], {
                    cwd: projectRoot,
                    detached: true,
                    stdio: "ignore",
                });
                if (child.pid !== undefined) {
                    db.updateWorkerPid(debateId, child.pid);
                }
                child.unref();
                project.dispose();
                return textResponse(`Debate initiated. ID: ${debateId}. Use \`alfred_status\` to track progress.`, { debateId });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                project.dispose();
                return errorResponse(`Failed to initiate background process: ${message}`);
            }
        },
    });
    // ─── alfred_status ───────────────────────────────────────────────────────
    pi.registerTool({
        name: "alfred_status",
        label: "Alfred Status",
        description: "Check the current status of a debate. Returns status and active member if running.",
        parameters: Type.Object({
            projectRoot: projectRootParam,
            debateId: Type.String({ description: "The debate ID to check" }),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, debateId } = params;
            const project = new AlfredProject(projectRoot);
            const db = await project.getDatabase();
            db.markStaleDebatesFailed();
            const metadata = db.getDebateMetadata(debateId);
            if (!metadata) {
                project.dispose();
                return errorResponse(`Debate '${debateId}' not found.`);
            }
            const entries = db.getDebateEntries(debateId);
            const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
            let statusText = `Status: **${metadata.status}**`;
            if (metadata.status === "running" && lastEntry) {
                statusText += `\nActive Member: **${lastEntry.author}**`;
                if (metadata.last_heartbeat) {
                    statusText += `\nLast Heartbeat: ${metadata.last_heartbeat}`;
                }
                if (metadata.worker_pid) {
                    statusText += `\nWorker PID: ${metadata.worker_pid}`;
                }
            }
            else if (metadata.status === "completed") {
                statusText += `\nCompleted at: ${metadata.closed_at}`;
            }
            else if (metadata.status === "failed") {
                statusText += `\nFailed at: ${metadata.closed_at}`;
            }
            project.dispose();
            return textResponse(statusText, { status: metadata.status });
        },
    });
    // ─── alfred_resume ──────────────────────────────────────────────────────────
    pi.registerTool({
        name: "alfred_resume",
        label: "Alfred Resume",
        description: "Resurrect a debate that crashed or timed out. Restarts the worker from the last successfully persisted turn.",
        parameters: Type.Object({
            projectRoot: projectRootParam,
            debateId: Type.String({ description: "The debate ID to resume" }),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, debateId } = params;
            const project = new AlfredProject(projectRoot);
            const db = await project.getDatabase();
            const metadata = db.getDebateMetadata(debateId);
            if (!metadata) {
                project.dispose();
                return errorResponse(`Debate '${debateId}' not found.`);
            }
            if (metadata.status === "completed") {
                project.dispose();
                return errorResponse(`Debate '${debateId}' is already completed and cannot be resumed.`);
            }
            // ─── Concurrency Guard ─────────────────────────────────────────────────
            // To prevent multiple resurrection workers, we use an atomic status update.
            let oldPid = null;
            try {
                await db.withTransaction(() => {
                    const current = db.getDebateMetadata(debateId);
                    if (!current)
                        throw new Error("Debate disappeared");
                    // If it's running and has a fresh heartbeat, don't resume.
                    if (current.status === "running" && current.last_heartbeat) {
                        const lastHb = new Date(current.last_heartbeat).getTime();
                        if (Date.now() - lastHb < 60 * 1000) { // 1 minute threshold
                            throw new Error("Debate is currently active and healthy. Use alfred_status to monitor.");
                        }
                    }
                    oldPid = current.worker_pid ?? null;
                    db.updateDebateStatus(debateId, "running");
                    // Use -1 as a sentinel to indicate "resurrection in progress"
                    db.updateWorkerPid(debateId, -1);
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                project.dispose();
                return errorResponse(`Concurrency guard: ${message}`);
            }
            // ─── Zombie Killer ────────────────────────────────────────────────────
            if (oldPid && oldPid !== -1) {
                try {
                    // Signal 0 checks for process existence
                    process.kill(oldPid, 0);
                    // Process is alive, try graceful then forced shutdown
                    process.kill(oldPid, "SIGTERM");
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    try {
                        process.kill(oldPid, 0);
                        process.kill(oldPid, "SIGKILL");
                    }
                    catch { }
                }
                catch (e) {
                    // ESRCH: process doesn't exist, no action needed
                }
            }
            const debate = db.reloadDebate(debateId);
            if (!debate) {
                project.dispose();
                return errorResponse(`Failed to reload debate state for '${debateId}'.`);
            }
            try {
                const workerPath = path.join(projectRoot, "packages/alfred/dist/worker.js");
                const args = [
                    projectRoot,
                    metadata.team,
                    debateId,
                    metadata.request_prompt,
                    JSON.stringify(debate.flow),
                ];
                const child = spawn("node", [workerPath, ...args], {
                    cwd: projectRoot,
                    detached: true,
                    stdio: "ignore",
                });
                if (child.pid !== undefined) {
                    db.updateWorkerPid(debateId, child.pid);
                }
                child.unref();
                project.dispose();
                return textResponse(`Resurrecting debate ${debateId} using surgical resume protocol...`, { debateId });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                project.dispose();
                return errorResponse(`Failed to resume background process: ${message}`);
            }
        },
    });
    pi.registerTool({
        name: "alfred_teams",
        label: "Alfred Teams",
        description: "List available teams in a project, or inspect a specific team's members.",
        parameters: Type.Object({
            projectRoot: projectRootParam,
            team: Type.Optional(Type.String({ description: "Team name to inspect (omit to list all teams)" })),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, team: teamName } = params;
            const project = new AlfredProject(projectRoot);
            if (!teamName) {
                const teams = await project.storage.listTeams();
                if (teams.length === 0) {
                    project.dispose();
                    return textResponse("No teams found in .alfred/teams/", { teams: [] });
                }
                project.dispose();
                return textResponse(`Available teams:\n${teams.map((t) => `- ${t}`).join("\n")}`, { teams });
            }
            try {
                const team = await project.storage.loadTeam(teamName);
                const members = team.members
                    .map((m) => `- **${m.id}** (${m.hat}) — ${m.role}\n  _${m.personality}_`)
                    .join("\n");
                project.dispose();
                return textResponse(`**${team.name}**: ${team.description}\n\n${members}`, { team });
            }
            catch {
                project.dispose();
                return errorResponse(`Team '${teamName}' not found`);
            }
        },
    });
}
