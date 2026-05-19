import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
const TASK_ARG_LIMIT = 8000;
function piCommand() {
    return process.platform === "win32" ? "pi.cmd" : "pi";
}
export async function runAgentTurn(member, systemPrompt, task, signal) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alfred-turn-"));
    try {
        const promptFile = path.join(tempDir, "prompt.md");
        fs.writeFileSync(promptFile, systemPrompt, { mode: 0o600 });
        const args = [
            "-p",
            "--no-session",
            "--model", member.model,
            "--system-prompt", promptFile,
            "--no-skills",
        ];
        if (member.tools.length > 0) {
            args.push("--tools", member.tools.join(","));
        }
        const taskArg = `Task: ${task}`;
        if (taskArg.length > TASK_ARG_LIMIT) {
            const taskFile = path.join(tempDir, "task.md");
            fs.writeFileSync(taskFile, taskArg, { mode: 0o600 });
            args.push(`@${taskFile}`);
        }
        else {
            args.push(taskArg);
        }
        let stdout = "";
        let stderr = "";
        let settled = false;
        const exitCode = await new Promise((resolve, reject) => {
            const child = spawn(piCommand(), args, {
                stdio: ["ignore", "pipe", "pipe"],
                env: {
                    ...process.env,
                    PI_SUBAGENT_CHILD: "1",
                    PI_SUBAGENT_INHERIT_PROJECT_CONTEXT: "0",
                    PI_SUBAGENT_INHERIT_SKILLS: "0",
                },
            });
            child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
            child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
            const settle = (fn) => {
                if (!settled) {
                    settled = true;
                    fn();
                }
            };
            signal?.addEventListener("abort", () => settle(() => {
                child.kill("SIGTERM");
                setTimeout(() => !child.killed && child.kill("SIGKILL"), 3000);
                reject(new Error(`[${member.id}] aborted`));
            }), { once: true });
            child.on("close", (code) => settle(() => resolve(code ?? 1)));
            child.on("error", (err) => settle(() => reject(err)));
        });
        if (exitCode !== 0) {
            const detail = stderr.trim() ? `\nstderr: ${stderr.trim()}` : "";
            throw new Error(`[${member.id}] exited with code ${exitCode}${detail}`);
        }
        return { memberId: member.id, output: stdout.trim(), exitCode };
    }
    finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
