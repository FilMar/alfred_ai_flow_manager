import { existsSync } from "node:fs";
import * as path from "node:path";
import { Type } from "typebox";
import { alfredDir, loadTeam, listTeams, saveDebate, saveProject, saveTeam } from "./fs.js";
import { runFlow } from "./flow-runner.js";
export default function registerAlfredExtension(pi) {
    // ─── alfred_init ─────────────────────────────────────────────────────────────
    pi.registerTool({
        name: "alfred_init",
        label: "Alfred Init",
        description: "Initialize an Alfred project in the given directory. Creates .alfred/alfred_project.json. Fails if the project already exists.",
        parameters: Type.Object({
            projectRoot: Type.String({ description: "Absolute path to the project root" }),
            name: Type.String({ description: "Project name" }),
            description: Type.Optional(Type.String({ description: "Project description" })),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, name, description = "" } = params;
            const projectFile = path.join(alfredDir(projectRoot), "alfred_project.json");
            if (existsSync(projectFile)) {
                return {
                    content: [{ type: "text", text: `Project already exists at ${projectFile}. Use alfred_teams to inspect it.` }],
                    details: {},
                };
            }
            const project = {
                name,
                description,
                teams: [],
                created: new Date().toISOString().slice(0, 10),
            };
            await saveProject(projectRoot, project);
            return {
                content: [{ type: "text", text: `Project '${name}' initialized at ${projectRoot}/.alfred/` }],
                details: { project },
            };
        },
    });
    // ─── alfred_team_create ──────────────────────────────────────────────────────
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
            projectRoot: Type.String({ description: "Absolute path to the project root containing .alfred/" }),
            team: Type.Object({
                name: Type.String({ description: "Team name (used as directory name, no spaces)" }),
                description: Type.String({ description: "What this team is for" }),
                members: Type.Array(Type.Object({
                    id: Type.String(),
                    hat: Type.String(),
                    role: Type.String(),
                    personality: Type.String(),
                    model: Type.String(),
                    tools: Type.Array(Type.String()),
                    skills: Type.Array(Type.String()),
                    maxToolCalls: Type.Number(),
                }), { description: "Team members", minItems: 1 }),
            }),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, team } = params;
            const teamDir = path.join(alfredDir(projectRoot), "teams", team.name);
            if (existsSync(teamDir)) {
                return {
                    content: [{ type: "text", text: `Team '${team.name}' already exists at ${teamDir}.` }],
                    details: {},
                };
            }
            const projectFile = path.join(alfredDir(projectRoot), "alfred_project.json");
            if (!existsSync(projectFile)) {
                return {
                    content: [{ type: "text", text: `No Alfred project found at ${projectRoot}. Run alfred_init first.` }],
                    details: {},
                };
            }
            await saveTeam(projectRoot, team);
            const members = team.members
                .map((m) => `  - ${m.id} (${m.hat}) — ${m.role}`)
                .join("\n");
            return {
                content: [{ type: "text", text: `Team '${team.name}' created with ${team.members.length} members:\n${members}` }],
                details: { team },
            };
        },
    });
    // ─── alfred_run ─────────────────────────────────────────────────────────────
    pi.registerTool({
        name: "alfred_run",
        label: "Alfred Run",
        description: `Orchestrate a team debate on a task.

Assembles a team of AI agents with distinct cognitive profiles, runs them through a flow,
and returns the full thread for synthesis.

Flow format (nested array):
  - "member-id"                       → sequential step
  - ["member-a", "member-b"]          → parallel group (same thread snapshot)
  - { roundtable: ["x","y"], rounds: 2 } → roundtable (each sees growing thread)

Example flows:
  ["researcher", "critic", "architect"]
  ["researcher", ["critic", "optimist"], "synthesizer"]
  [{ "roundtable": ["critic", "optimist", "blue-core"], "rounds": 2 }]`,
        parameters: Type.Object({
            projectRoot: Type.String({ description: "Absolute path to the project root containing .alfred/" }),
            team: Type.String({ description: "Team name (must exist in .alfred/teams/)" }),
            flow: Type.Array(Type.Any(), { description: "Execution flow descriptor" }),
            task: Type.String({ description: "The task or question for the team" }),
        }),
        async execute(_id, params, signal, _onUpdate, _ctx) {
            const { projectRoot, team: teamName, task } = params;
            const flow = params.flow;
            let team;
            try {
                team = await loadTeam(projectRoot, teamName);
            }
            catch {
                return {
                    content: [{ type: "text", text: `Team '${teamName}' not found in ${projectRoot}/.alfred/teams/` }],
                    details: {},
                };
            }
            const debateId = `${new Date().toISOString().slice(0, 10)}_${task
                .slice(0, 40)
                .replace(/[^a-z0-9]+/gi, "-")
                .toLowerCase()
                .replace(/^-|-$/g, "")}`;
            const debate = {
                id: debateId,
                team: teamName,
                flow,
                task,
                thread: [],
            };
            try {
                await runFlow(flow, team.members, debate, signal);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                await saveDebate(projectRoot, debate).catch(() => { });
                return {
                    content: [{ type: "text", text: `Flow failed: ${message}\n\nPartial thread saved to .alfred/debates/${debateId}/` }],
                    details: { debate },
                };
            }
            await saveDebate(projectRoot, debate);
            const threadText = debate.thread
                .map((e) => `**${e.author}** (${e.timestamp.slice(0, 16)}):\n${e.content}`)
                .join("\n\n---\n\n");
            const result = [
                `## Debate: ${debateId}`,
                `Team: **${teamName}** | ${debate.thread.length} contributions`,
                ``,
                threadText,
                ``,
                `---`,
                `Now synthesize the above contributions into a coherent response for the user.`,
            ].join("\n");
            return {
                content: [{ type: "text", text: result }],
                details: { debate },
            };
        },
    });
    // ─── alfred_teams ────────────────────────────────────────────────────────────
    pi.registerTool({
        name: "alfred_teams",
        label: "Alfred Teams",
        description: "List available teams in a project, or inspect a specific team's members.",
        parameters: Type.Object({
            projectRoot: Type.String({ description: "Absolute path to the project root" }),
            team: Type.Optional(Type.String({ description: "Team name to inspect (omit to list all teams)" })),
        }),
        async execute(_id, params, _signal, _onUpdate, _ctx) {
            const { projectRoot, team: teamName } = params;
            if (!teamName) {
                const teams = await listTeams(projectRoot);
                if (teams.length === 0) {
                    return {
                        content: [{ type: "text", text: "No teams found in .alfred/teams/" }],
                        details: { teams: [] },
                    };
                }
                return {
                    content: [{ type: "text", text: `Available teams:\n${teams.map((t) => `- ${t}`).join("\n")}` }],
                    details: { teams },
                };
            }
            try {
                const team = await loadTeam(projectRoot, teamName);
                const members = team.members
                    .map((m) => `- **${m.id}** (${m.hat}) — ${m.role}\n  _${m.personality}_`)
                    .join("\n");
                return {
                    content: [{ type: "text", text: `**${team.name}**: ${team.description}\n\n${members}` }],
                    details: { team },
                };
            }
            catch {
                return {
                    content: [{ type: "text", text: `Team '${teamName}' not found` }],
                    details: {},
                };
            }
        },
    });
}
