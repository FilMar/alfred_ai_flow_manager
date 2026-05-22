import { existsSync, mkdirSync, openSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "worker.js");
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AlfredProject as AlfredProjectType, Debate, Flow, Team } from "./types.js";
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

function spawnWorker(projectRoot: string, debateId: string, workerArgs: string[]): ReturnType<typeof spawn> {
  const logsDir = path.join(projectRoot, ".alfred", "logs");
  mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${debateId}.log`);
  const logFd = openSync(logPath, "a");
  const child = spawn("node", [WORKER_PATH, ...workerArgs], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  return child;
}

function slugifyDebateTitle(task: string): string {
  return task
    .slice(0, 40)
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .replace(/^-|-$/g, "") || "debate";
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function registerAlfredExtension(pi: ExtensionAPI): void {

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

      const projectData: AlfredProjectType = {
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

      let validatedTeam: Team;
      try {
        validatedTeam = {
          ...team,
          name: validateTeamName(team.name),
        } as Team;
      } catch (err) {
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
      return textResponse(
        `Team '${validatedTeam.name}' created with ${validatedTeam.members.length} members:\n${members}`,
        { team: validatedTeam },
      );
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
      groupId: Type.Optional(Type.String({ description: "Logical group linking briefing, execution and preservation steps" })),
      type: Type.Optional(Type.Union([
        Type.Literal("briefing"),
        Type.Literal("execution"),
        Type.Literal("preservation")
      ], { description: "Type of run: briefing, execution, or preservation" })),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const { projectRoot, team: teamName, task, groupId, type } = params;
      const flow = params.flow as Flow;
      const project = new AlfredProject(projectRoot);

      let team;
      try {
        team = await project.storage.loadTeam(teamName);
      } catch {
        project.dispose();
        return errorResponse(`Team '${teamName}' not found in ${projectRoot}/.alfred/teams/`);
      }

      const title = slugifyDebateTitle(task);
      const debateData: Omit<Debate, "id" | "sequence"> = {
        team: teamName,
        flow,
        groupId,
        type,
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
        const args = [projectRoot, teamName, debateId, task, JSON.stringify(flow)];
        const child = spawnWorker(projectRoot, debateId, args);

        if (child.pid !== undefined) {
          db.updateWorkerPid(debateId, child.pid);
        }

        project.dispose();
        return textResponse(`Debate initiated. ID: ${debateId}. Log: .alfred/logs/${debateId}.log`, { debateId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        project.dispose();
        return errorResponse(`Failed to initiate background process: ${message}`);
      }
    },
  });

  // ─── alfred_get ────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "alfred_get",
    label: "Alfred Get",
    description: "Retrieve specific information from the Alfred persistence layer. Supports fetching full threads, mission groups, or filtered lists of debates.",
    parameters: Type.Object({
      projectRoot: projectRootParam,
      filter: Type.Object({
        debateId: Type.Optional(Type.String({ description: "Retrieve the full thread of a specific debate." })),
        groupId: Type.Optional(Type.String({ description: "Retrieve all debates linked to a logical mission group." })),
        team: Type.Optional(Type.String({ description: "Retrieve recent debates for a specific team." })),
        type: Type.Optional(Type.Union([
          Type.Literal("briefing"),
          Type.Literal("execution"),
          Type.Literal("preservation")
        ], { description: "Retrieve debates of a specific type." })),
        limit: Type.Optional(Type.Number({ description: "Limit the number of returned records. Default: 10." })),
      }, { description: "Search filter. Use only one primary identifier (debateId or groupId) for precise results." }),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const { projectRoot, filter } = params;
      const project = new AlfredProject(projectRoot);
      const db = await project.getDatabase();

      try {
        if (filter.debateId) {
          const thread = db.getThread(filter.debateId);
          if (!thread) {
            project.dispose();
            return errorResponse(`Debate '${filter.debateId}' not found or has no entries.`);
          }

          const formattedThread = thread
            .map((e, i) => `${i+1}. [${e.author}] ${e.content}`)
            .join("\n\n");

          project.dispose();
          return textResponse(`**Thread for ${filter.debateId}**\n\n${formattedThread}`, { thread });
        }

        if (filter.groupId) {
          const group = db.getDebatesByGroup(filter.groupId);
          if (group.length === 0) {
            project.dispose();
            return errorResponse(`No debates found for group '${filter.groupId}'.`);
          }

          const missionOutline = group
            .map(d => `- ${d.id} [${d.type || "unknown"}] | ${d.request_title}`)
            .join("\n");

          project.dispose();
          return textResponse(`**Mission Group: ${filter.groupId}**\n\n${missionOutline}`, { group });
        }

        const debates = db.getDebatesByFilter({
          team: filter.team,
          type: filter.type,
          limit: filter.limit || 10
        });

        if (debates.length === 0) {
          project.dispose();
          return textResponse("No matching debates found.");
        }

        const list = debates
          .map(d => `- ${d.id} | ${d.team} | ${d.type || "execution"} | ${d.request_title}`)
          .join("\n");

        project.dispose();
        return textResponse(`**Retrieved Debates**\n\n${list}`, { debates });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        project.dispose();
        return errorResponse(`Failed to retrieve data: ${message}`);
      }
    },
  });

  // ─── alfred_status ───────────────────────────────────────────────────────

  pi.registerTool({
    name: "alfred_status",
    label: "Alfred Status",
    description: "Check the status of one or all debates. If debateId is omitted, it lists all active processes (Radar Mode). If provided, it shows detailed telemetry for that specific debate (Deep Dive Mode).",
    parameters: Type.Object({
      projectRoot: projectRootParam,
      debateId: Type.Optional(Type.String({ description: "The debate ID to check. Omit for global radar view." })),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const { projectRoot, debateId } = params;
      const project = new AlfredProject(projectRoot);
      const db = await project.getDatabase();

      db.markStaleDebatesFailed();

      if (!debateId) {
        const allTeams = await project.storage.listTeams();
        const activeDebates: any[] = [];

        for (const team of allTeams) {
          const teamDebates = db.getTeamDebates(team);
          const running = teamDebates.filter(d => d.closed_at === null);
          activeDebates.push(...running);
        }

        if (activeDebates.length === 0) {
          project.dispose();
          return textResponse("No active debates currently running or paused.");
        }

        let radarOutput = "**Alfred Global Radar**\n\n";
        radarOutput += "| ID | Team | Title | Entries |\n|---|---|---|---|\n";
        radarOutput += activeDebates
          .map(d => `| ${d.id} | ${d.team} | ${d.title} | ${d.entry_count} |`)
          .join("\n");

        radarOutput += "\n\nUse \`alfred_get({ debateId: '...' })\` for thread retrieval or \`alfred_resume\` for failed runs.";
        project.dispose();
        return textResponse(radarOutput);
      }

      const metadata = db.getDebateMetadata(debateId);
      if (!metadata) {
        project.dispose();
        return errorResponse(`Debate '${debateId}' not found.`);
      }

      const entries = db.getDebateEntries(debateId);
      const stats = db.getMemberStats(debateId);
      const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

      let deepDive = `**Telemetry for ${debateId}**\n`;
      deepDive += `Status: \`${metadata.status.toUpperCase()}\` | Team: \`${metadata.team}\`\n`;
      deepDive += `Start: ${metadata.created_at}${metadata.closed_at ? ` → End: ${metadata.closed_at}` : ''}\n`;

      if (metadata.status === "running") {
        deepDive += `\n**Heartbeat**: ${metadata.last_heartbeat || "N/A"}\n`;
        deepDive += `**Worker PID**: ${metadata.worker_pid || "Unknown"}\n`;
        if (lastEntry) {
          deepDive += `**Last Active**: ${lastEntry.author}\n`;
          deepDive += `**Last Output**: _"${lastEntry.content.slice(0, 100)}${lastEntry.content.length > 100 ? '...' : ''}"_\n`;
        }
      } else if (metadata.status === "failed") {
        deepDive += `\n**Crashed**: This debate terminated unexpectedly.\n`;
        deepDive += `**Action**: Use \`alfred_resume({ debateId: '${debateId}' })\` to recover from the last stable step.`;
      } else if (metadata.status === "completed") {
        deepDive += `\n**Finished**: Result is ready for synthesis.`;
      }

      if (entries.length > 0) {
        deepDive += `\n\n**Team Performance**:\n`;
        deepDive += stats
          .map(s => `- ${s.author}: ${s.turns} turns | avg ${s.avg_duration_ms}ms | ${s.error_count} errors`)
          .join("\n");
      }

      project.dispose();
      return textResponse(deepDive, { status: metadata.status });
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

      let oldPid: number | null = null;

      try {
        await db.withTransaction(() => {
          const current = db.getDebateMetadata(debateId);
          if (!current) throw new Error("Debate disappeared");

          if (current.status === "running" && current.last_heartbeat) {
            const lastHb = new Date(current.last_heartbeat).getTime();
            if (Date.now() - lastHb < 60 * 1000) {
              throw new Error("Debate is currently active and healthy. Use alfred_status to monitor.");
            }
          }

          oldPid = current.worker_pid ?? null;
          db.updateDebateStatus(debateId, "running");
          db.updateWorkerPid(debateId, -1);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        project.dispose();
        return errorResponse(`Concurrency guard: ${message}`);
      }

      if (oldPid && oldPid !== -1) {
        try {
          process.kill(oldPid, 0);
          process.kill(oldPid, "SIGTERM");
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            process.kill(oldPid, 0);
            process.kill(oldPid, "SIGKILL");
          } catch {}
        } catch (e) {}
      }

      const debate = db.reloadDebate(debateId);
      if (!debate) {
        project.dispose();
        return errorResponse(`Failed to reload debate state for '${debateId}'.`);
      }

      try {
        const args = [projectRoot, metadata.team, debateId, metadata.request_prompt, JSON.stringify(debate.flow)];
        const child = spawnWorker(projectRoot, debateId, args);

        if (child.pid !== undefined) {
          db.updateWorkerPid(debateId, child.pid);
        }

        project.dispose();
        return textResponse(`Resurrecting debate ${debateId} using surgical resume protocol... Log: .alfred/logs/${debateId}.log`, { debateId });
      } catch (err) {
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
        return textResponse(
          `Available teams:\n${teams.map((t) => `- ${t}`).join("\n")}`,
          { teams },
        );
      }

      try {
        const team = await project.storage.loadTeam(teamName);
        const members = team.members
          .map((m) => `- **${m.id}** (${m.hat}) — ${m.role}\n  _${m.personality}_`)
          .join("\n");
        project.dispose();
        return textResponse(`**${team.name}**: ${team.description}\n\n${members}`, { team });
      } catch {
        project.dispose();
        return errorResponse(`Team '${teamName}' not found`);
      }
    },
  });
}
