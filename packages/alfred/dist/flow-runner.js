import { loadHat, buildSystemPrompt } from "./hats.js";
import { AlfredStorage } from "./AlfredStorage.js";
import { runAgentTurn } from "./spawn.js";
function now() {
    return new Date().toISOString();
}
function isRoundtable(step) {
    return typeof step === "object" && !Array.isArray(step) && "roundtable" in step;
}
function getMember(id, members) {
    const m = members.find((m) => m.id === id);
    if (!m)
        throw new Error(`Member '${id}' not found in team`);
    return m;
}
/**
 * Invoke the agent turn without persistence logic.
 * Responsibility: Prompt construction and LLM execution.
 */
async function invokeMember(member, debate, threadSnapshot, signal) {
    let hat;
    try {
        hat = await loadHat(member.hat);
    }
    catch (err) {
        throw new Error(`Hat '${member.hat}' not found for member '${member.id}' (check hats/ directory). ` +
            `${err instanceof Error ? err.message : String(err)}`);
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
async function executeAndPersistTurn(member, turnTask, debate, db, flowStepId) {
    const start = performance.now();
    let output;
    let exitCode = 0;
    let errorMessage;
    try {
        output = await turnTask();
    }
    catch (err) {
        exitCode = 1;
        errorMessage = err instanceof Error ? err.message : String(err);
        output = `[Error: ${errorMessage}]`;
    }
    const end = performance.now();
    const durationMs = end - start;
    const entry = {
        author: member.id,
        timestamp: now(),
        content: output,
        performance: {
            duration_ms: durationMs,
            exit_code: exitCode,
            error: errorMessage,
        },
    };
    db.insertTurn(debate.id, entry, flowStepId);
    debate.thread.push(entry);
}
async function runStep(step, stepIndex, members, debate, db, completedSteps, signal) {
    if (typeof step === "string") {
        const member = getMember(step, members);
        const flowStepId = `step_${stepIndex}_${member.id}`;
        if (completedSteps.has(flowStepId))
            return;
        await executeAndPersistTurn(member, () => invokeMember(member, debate, AlfredStorage.formatThread(debate), signal), debate, db, flowStepId);
        completedSteps.add(flowStepId);
    }
    if (Array.isArray(step)) {
        const groupSize = step.length;
        const snapshot = AlfredStorage.formatThread(debate);
        await Promise.all(step.map(async (s) => {
            if (typeof s !== "string")
                throw new Error("Nested parallel groups are not supported");
            const member = getMember(s, members);
            const flowStepId = `step_${stepIndex}_${member.id}`;
            if (completedSteps.has(flowStepId))
                return;
            await executeAndPersistTurn(member, () => invokeMember(member, debate, snapshot, signal), debate, db, flowStepId);
            completedSteps.add(flowStepId);
        }));
    }
    if (isRoundtable(step)) {
        const { roundtable, rounds = 1 } = step;
        for (let round = 0; round < rounds; round++) {
            for (const memberId of roundtable) {
                const member = getMember(memberId, members);
                const flowStepId = `step_${stepIndex}_rt_${round}_${member.id}`;
                if (completedSteps.has(flowStepId))
                    continue;
                await executeAndPersistTurn(member, () => invokeMember(member, debate, AlfredStorage.formatThread(debate), signal), debate, db, flowStepId);
                completedSteps.add(flowStepId);
            }
        }
    }
}
export async function runFlow(flow, members, debate, db, signal) {
    const completedSteps = new Set(db.getCompletedFlowSteps(debate.id));
    for (let i = 0; i < flow.length; i++) {
        if (signal?.aborted)
            break;
        // Update heartbeat to prevent markStaleDebatesFailed from killing long turns
        db.updateHeartbeat(debate.id);
        await runStep(flow[i], i, members, debate, db, completedSteps, signal);
    }
}
