import { loadHat, buildSystemPrompt } from "./hats.js";
import { formatThread } from "./fs.js";
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
async function runMember(member, debate, threadSnapshot, signal) {
    let hat;
    try {
        hat = await loadHat(member.hat);
    }
    catch (err) {
        throw new Error(`Hat '${member.hat}' not found for member '${member.id}' (check hats/ directory). ` +
            `${err instanceof Error ? err.message : String(err)}`);
    }
    const systemPrompt = buildSystemPrompt(member.role, member.personality, hat, threadSnapshot);
    const result = await runAgentTurn(member, systemPrompt, debate.task, signal);
    return result.output;
}
async function runStep(step, members, debate, signal) {
    if (typeof step === "string") {
        const member = getMember(step, members);
        const output = await runMember(member, debate, formatThread(debate), signal);
        debate.thread.push({ author: member.id, timestamp: now(), content: output });
        return;
    }
    if (Array.isArray(step)) {
        const snapshot = formatThread(debate);
        const settled = await Promise.allSettled(step.map(async (s) => {
            if (typeof s !== "string")
                throw new Error("Nested parallel groups are not supported");
            const member = getMember(s, members);
            const output = await runMember(member, debate, snapshot, signal);
            return { id: member.id, output };
        }));
        for (const result of settled) {
            if (result.status === "fulfilled") {
                debate.thread.push({ author: result.value.id, timestamp: now(), content: result.value.output });
            }
            else {
                const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
                debate.thread.push({ author: "alfred", timestamp: now(), content: `[Parallel step failed: ${msg}]` });
            }
        }
        return;
    }
    if (isRoundtable(step)) {
        const { roundtable, rounds = 1 } = step;
        for (let round = 0; round < rounds; round++) {
            for (const memberId of roundtable) {
                const member = getMember(memberId, members);
                // Each member sees all contributions so far (growing thread)
                const output = await runMember(member, debate, formatThread(debate), signal);
                debate.thread.push({ author: member.id, timestamp: now(), content: output });
            }
        }
        return;
    }
}
export async function runFlow(flow, members, debate, signal) {
    for (const step of flow) {
        if (signal?.aborted)
            break;
        await runStep(step, members, debate, signal);
    }
}
