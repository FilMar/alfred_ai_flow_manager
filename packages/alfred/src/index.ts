import { existsSync } from "node:fs";
import * as path from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AlfredProject, Flow, Team } from "./types.js";
import { HAT_IDS, TOOL_IDS } from "./types.js";
import { alfredDir, loadTeam, listTeams, saveDebate, saveProject, saveTeam, formatThread } from "./fs.js";
import { runFlow } from "./flow-runner.js";
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

      const projectFile = path.join(alfredDir(projectRoot), "alfred_project.json");
      if (existsSync(projectFile)) {
        return errorResponse(`Project already exists at ${projectFile}. Use alfred_teams to inspect it.`);
      }

      const project: AlfredProject = {
        name,
        description,
        teams: [],
        created: new Date().toISOString().slice(0, 10),
      };

      await saveProject(projectRoot, project);
      return textResponse(`Project '${name}' initialized at ${projectRoot}/.alfred/`, { project });
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

      const teamDir = path.join(alfredDir(projectRoot), "teams", team.name);
      if (existsSync(teamDir)) {
        return errorResponse(`Team '${team.name}' already exists at ${teamDir}.`);
      }

      const projectFile = path.join(alfredDir(projectRoot), "alfred_project.json");
      if (!existsSync(projectFile)) {
        return errorResponse(`No Alfred project found at ${projectRoot}. Run alfred_init first.`);
      }

      await saveTeam(projectRoot, team as Team);

      const members = (team as Team).members
        .map((m) => `  - ${m.id} (${m.hat}) — ${m.role}`)
        .join("\n");

      return textResponse(
        `Team '${team.name}' created with ${team.members.length} members:\n${members}`,
        { team },
      );
    },
  });

  // ─── alfred_run ───────────────────────────────────────────────────────────

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
      projectRoot: projectRootParam,
      team: Type.String({ description: "Team name (must exist in .alfred/teams/)" }),
      flow: Type.Array(FlowStepSchema, { description: "Execution flow descriptor" }),
      task: Type.String({ description: "The task or question for the team" }),
    }),

    async execute(_id, params, signal, _onUpdate, _ctx) {
      const { projectRoot, team: teamName, task } = params;
      const flow = params.flow as Flow;

      let team;
      try {
        team = await loadTeam(projectRoot, teamName);
      } catch {
        return errorResponse(`Team '${teamName}' not found in ${projectRoot}/.alfred/teams/`);
      }

      const slug = task
        .slice(0, 40)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()
        .replace(/^-|-$/g, "");
      const debateId = `${new Date().toISOString().slice(0, 10)}_${slug || `debate-${Date.now()}`}`;

      const debate = {
        id: debateId,
        team: teamName,
        flow,
        task,
        thread: [] as { author: string; timestamp: string; content: string }[],
      };

      try {
        await runFlow(flow, team.members, debate, signal);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        let savedInfo = "";
        try {
          await saveDebate(projectRoot, debate);
          savedInfo = `\n\nPartial thread saved to .alfred/debates/${debateId}/`;
        } catch (saveErr) {
          const saveMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
          savedInfo = `\n\nFailed to save partial thread: ${saveMsg}`;
        }
        return errorResponse(`Flow failed: ${message}${savedInfo}`);
      }

      await saveDebate(projectRoot, debate);

      const threadText = formatThread(debate, true);

      const result = [
        `## Debate: ${debateId}`,
        `Team: **${teamName}** | ${debate.thread.length} contributions`,
        ``,
        threadText,
        ``,
        `---`,
        `Now synthesize the above contributions into a coherent response for the user.`,
      ].join("\n");

      return textResponse(result, { debate });
    },
  });

  // ─── alfred_teams ─────────────────────────────────────────────────────────

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

      if (!teamName) {
        const teams = await listTeams(projectRoot);
        if (teams.length === 0) {
          return textResponse("No teams found in .alfred/teams/", { teams: [] });
        }
        return textResponse(
          `Available teams:\n${teams.map((t) => `- ${t}`).join("\n")}`,
          { teams },
        );
      }

      try {
        const team = await loadTeam(projectRoot, teamName);
        const members = team.members
          .map((m) => `- **${m.id}** (${m.hat}) — ${m.role}\n  _${m.personality}_`)
          .join("\n");
        return textResponse(`**${team.name}**: ${team.description}\n\n${members}`, { team });
      } catch {
        return errorResponse(`Team '${teamName}' not found`);
      }
    },
  });
}
