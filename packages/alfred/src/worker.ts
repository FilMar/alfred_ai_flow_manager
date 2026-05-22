import * as path from "node:path";
import { AlfredProject } from "./AlfredProject.js";
import { runFlow } from "./flow-runner.js";
import type { Debate, Flow } from "./types.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 5) {
    console.error("Usage: node worker.ts <projectRoot> <teamName> <debateId> <task> <flowJson>");
    process.exit(1);
  }

  const [projectRoot, teamName, debateId, task, flowJson] = args;
  const flow: Flow = JSON.parse(flowJson);
  const project = new AlfredProject(projectRoot);

  try {
    const team = await project.storage.loadTeam(teamName);
    const db = await project.getDatabase();

    const debate = db.reloadDebate(debateId);
    if (!debate) {
      throw new Error(`Debate ${debateId} not found in database`);
    }

    const heartbeatInterval = setInterval(() => {
      db.updateHeartbeat(debateId);
    }, 30_000);

    try {
      db.updateHeartbeat(debateId);
      await runFlow(debate.flow, team.members, debate, db);
      const closedAt = new Date().toISOString();
      db.markDebateClosed(debateId, closedAt, "completed");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Flow failed: ${message}`);
      const closedAt = new Date().toISOString();
      db.markDebateClosed(debateId, closedAt, "failed");
    } finally {
      clearInterval(heartbeatInterval);
    }
  } catch (err) {
    console.error(`Worker critical failure: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    project.dispose();
  }
}

main().catch((err) => {
  console.error(`Unhandled rejection: ${err}`);
  process.exit(1);
});
