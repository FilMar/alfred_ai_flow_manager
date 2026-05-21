import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { TeamMember, AgentTurnResult } from "./types.js";

/**
 * Limite in caratteri per il task inline via argv.
 * Se superato, il task viene scritto su file temporaneo e passato via @file.
 * 8000 è conservativo: ARG_MAX su Linux è ~128KB ma lasciamo margine per env vars e args.
 */
const TASK_ARG_LIMIT = 8000;

/**
 * Limite in byte per stdout/stderr catturati.
 * Protegge da subprocess che generano output fuori controllo.
 */
const MAX_OUTPUT = 1_000_000; // 1MB

function piCommand(): string {
  return process.platform === "win32" ? "pi.cmd" : "pi";
}

export async function runAgentTurn(
  member: TeamMember,
  systemPrompt: string,
  task: string,
  signal?: AbortSignal,
): Promise<AgentTurnResult> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "alfred-turn-"));
  const startMs = Date.now();

  try {
    const promptFile = path.join(tempDir, "prompt.md");
    fs.writeFileSync(promptFile, systemPrompt, { mode: 0o600 });

    const args: string[] = [
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
    } else {
      args.push(taskArg);
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(piCommand(), args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Segnala al subprocess che è un sottoagente — disabilita ereditarietà della sessione parent
          PI_SUBAGENT_CHILD: "1",
          // Impedisce iniezione automatica del project context — il task è esplicito
          PI_SUBAGENT_INHERIT_PROJECT_CONTEXT: "0",
          // Skill controllate via --no-skills; questa è una valvola di sicurezza ridondante
          PI_SUBAGENT_INHERIT_SKILLS: "0",
        },
      });

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT) {
          stdout += chunk.toString();
          if (stdout.length >= MAX_OUTPUT) {
            stdout = stdout.slice(0, MAX_OUTPUT) + "\n\n[... output truncated after 1MB]";
          }
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT) {
          stderr += chunk.toString();
          if (stderr.length >= MAX_OUTPUT) {
            stderr = stderr.slice(0, MAX_OUTPUT) + "\n\n[... output truncated after 1MB]";
          }
        }
      });

      const settle = (fn: () => void) => {
        if (!settled) { settled = true; fn(); }
      };

      signal?.addEventListener("abort", () => settle(() => {
        child.kill("SIGTERM");
        setTimeout(() => !child.killed && child.kill("SIGKILL"), 3000);
        reject(new Error(`[${member.id}] aborted`));
      }), { once: true });

      child.on("close", (code) => settle(() => resolve(code ?? 1)));
      child.on("error", (err) => settle(() => reject(err)));
    });

    const durationMs = Date.now() - startMs;

    if (exitCode !== 0) {
      const detail = stderr.trim() ? `\nstderr: ${stderr.trim()}` : "";
      const errorMsg = `[${member.id}] exited with code ${exitCode}${detail}`;
      return {
        memberId: member.id,
        output: stdout.trim(),
        exitCode,
        duration_ms: durationMs,
        error: errorMsg,
      };
    }

    return {
      memberId: member.id,
      output: stdout.trim(),
      exitCode,
      duration_ms: durationMs,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
