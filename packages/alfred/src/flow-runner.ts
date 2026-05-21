import type { FlowStep, RoundtableNode, TeamMember, Debate, DebateEntry } from "./types.js";
import { loadHat, buildSystemPrompt } from "./hats.js";
import { AlfredStorage } from "./AlfredStorage.js";
import { runAgentTurn } from "./spawn.js";
import { AlfredDatabase } from "./AlfredDatabase.js";

function now(): string {
  return new Date().toISOString();
}

function isRoundtable(step: FlowStep): step is RoundtableNode {
  return typeof step === "object" && !Array.isArray(step) && "roundtable" in step;
}

function getMember(id: string, members: TeamMember[]): TeamMember {
  const m = members.find((m) => m.id === id);
  if (!m) throw new Error(`Member '${id}' not found in team`);
  return m;
}

/**
 * Invoke the agent turn without persistence logic.
 * Responsibility: Prompt construction and LLM execution.
 */
async function invokeMember(
  member: TeamMember,
  debate: Debate,
  threadSnapshot: string,
  signal?: AbortSignal,
): Promise<string> {
  let hat: string;
  try {
    hat = await loadHat(member.hat);
  } catch (err) {
    throw new Error(
      `Hat '${member.hat}' not found for member '${member.id}' (check hats/ directory). ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const systemPrompt = buildSystemPrompt(member.role, member.personality, hat, threadSnapshot);
  
  const result = await runAgentTurn(member, systemPrompt, debate.request.prompt, signal);
  
  if (result.exitCode !== 0) {
    throw new Error(result.error || "Agent turn failed mysteriously");
  }
  
  return result.output;
}

/**
 * Atomic helper to execute a turn, time it, and persist it across DB and RAM.
 * Ensures consistency and avoids "Zombie States" where RAM and DB diverge.
 */
async function executeAndPersistTurn(
  member: TeamMember,
  turnTask: () => Promise<string>,
  debate: Debate,
  db: AlfredDatabase,
): Promise<void> {
  const start = performance.now();
  let output: string;
  let exitCode: number = 0;
  let errorMessage: string | undefined;

  try {
    output = await turnTask();
  } catch (err) {
    exitCode = 1;
    errorMessage = err instanceof Error ? err.message : String(err);
    output = `[Error: ${errorMessage}]`;
  }

  const end = performance.now();
  const durationMs = end - start;

  const entry: DebateEntry = {
    author: member.id,
    timestamp: now(),
    content: output,
    performance: {
      duration_ms: durationMs,
      exit_code: exitCode,
      error: errorMessage,
    },
  };

  db.insertTurn(debate.id, entry);
  debate.thread.push(entry);
}

async function runStep(
  step: FlowStep,
  members: TeamMember[],
  debate: Debate,
  db: AlfredDatabase,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof step === "string") {
    const member = getMember(step, members);
    await executeAndPersistTurn(
      member,
      () => invokeMember(member, debate, AlfredStorage.formatThread(debate), signal),
      debate,
      db,
    );
    return;
  }

  if (Array.isArray(step)) {
    const snapshot = AlfredStorage.formatThread(debate);
    await Promise.all(
      step.map(async (s) => {
        if (typeof s !== "string") throw new Error("Nested parallel groups are not supported");
        const member = getMember(s, members);
        await executeAndPersistTurn(
          member,
          () => invokeMember(member, debate, snapshot, signal),
          debate,
          db,
        );
      }),
    );
    return;
  }

  if (isRoundtable(step)) {
    const { roundtable, rounds = 1 } = step;
    for (let round = 0; round < rounds; round++) {
      for (const memberId of roundtable) {
        const member = getMember(memberId, members);
        await executeAndPersistTurn(
          member,
          () => invokeMember(member, debate, AlfredStorage.formatThread(debate), signal),
          debate,
          db,
        );
      }
    }
    return;
  }
}

export async function runFlow(
  flow: FlowStep[],
  members: TeamMember[],
  debate: Debate,
  db: AlfredDatabase,
  signal?: AbortSignal,
): Promise<void> {
  for (const step of flow) {
    if (signal?.aborted) break;
    await runStep(step, members, debate, db, signal);
  }
}
