import { openSync, writeSync, closeSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getModel, getProviders } from "@earendil-works/pi-ai";
import type { KnownProvider } from "@earendil-works/pi-ai";
import { loadMember, validateName } from "./members.js";

// ─── Sandbox (bwrap) ──────────────────────────────────────────────────────────

const BWRAP_SENTINEL = "TH_BWRAPPED";

let _bwrapAvailable: boolean | null = null;
function bwrapAvailable(): boolean {
  if (_bwrapAvailable === null)
    _bwrapAvailable = spawnSync("which", ["bwrap"], { stdio: "ignore" }).status === 0;
  return _bwrapAvailable;
}

function makeBwrapArgs(cwd: string): string[] {
  const home = homedir();
  return [
    "--ro-bind", "/", "/",
    "--proc", "/proc",
    "--dev", "/dev",
    "--bind", cwd, cwd,
    "--bind", `${home}/.pi`, `${home}/.pi`,
    "--bind", `${home}/.bun`, `${home}/.bun`,
    "--bind", "/tmp", "/tmp",
    "--setenv", "HOME", home,
    "--",
  ];
}

function spawnSandboxed(
  bin: string,
  args: string[],
  opts: Parameters<typeof spawn>[2],
): ReturnType<typeof spawn> {
  const cwd = process.cwd();
  if (bwrapAvailable())
    return spawn("bwrap", [...makeBwrapArgs(cwd), bin, ...args], {
      ...opts,
      env: { ...process.env, [BWRAP_SENTINEL]: "1" },
    });
  return spawn(bin, args, opts);
}

/** Re-exec the current process under bwrap. Never returns if bwrap is found. */
export function tryReexecWithBwrap(): void {
  if (process.env[BWRAP_SENTINEL]) return;
  if (!bwrapAvailable()) return;
  const r = spawnSync(
    "bwrap",
    [...makeBwrapArgs(process.cwd()), process.argv[0], process.argv[1], ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, [BWRAP_SENTINEL]: "1" } },
  );
  process.exit(r.status ?? 1);
}

// ─── API ──────────────────────────────────────────────────────────────────────

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function loadSkillFromPath(skillPath: string): Skill {
  const abs = resolve(skillPath);
  const filePath = existsSync(join(abs, "SKILL.md")) ? join(abs, "SKILL.md") : abs;
  if (!existsSync(filePath)) throw new Error(`Skill non trovata: ${skillPath}`);
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`Frontmatter YAML mancante in: ${filePath}`);
  const fm = match[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const desc = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name) throw new Error(`Campo 'name' mancante nel frontmatter di: ${filePath}`);
  if (!desc) throw new Error(`Campo 'description' mancante nel frontmatter di: ${filePath}`);
  return { name, description: desc, filePath, baseDir: dirname(filePath), source: "custom" };
}
const LOG_RESULT_MAX = 500;

export async function listAvailableModels(): Promise<Array<{ provider: string; id: string; name: string }>> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const available = await modelRegistry.getAvailable();
  return available.map((m) => ({ provider: m.provider, id: m.id, name: m.name }));
}

export function makeJobPaths(memberName: string): { base: string; out: string; log: string; status: string } {
  validateName(memberName);
  const base = join(tmpdir(), `th-${memberName}-${Date.now()}`);
  return { base, out: `${base}.out`, log: `${base}.log`, status: `${base}.status` };
}

export function spawnDetached(
  memberName: string,
  rawArgs: string[],
  execPath: string,
  scriptPath: string,
): { pid: number | undefined; out: string; log: string; status: string } {
  const paths = makeJobPaths(memberName);
  writeFileSync(paths.status, "running");

  const args = rawArgs.filter((a) => a !== "--detach");
  if (!args.includes("--output")) args.push("--output", paths.out);

  const child = spawnSandboxed(execPath, [scriptPath, ...args], { detached: true, stdio: "ignore" });
  child.unref();

  return { pid: child.pid, out: paths.out, log: paths.log, status: paths.status };
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + `… [+${str.length - max} chars]` : str;
}

export async function runMember(
  memberName: string,
  task: string,
  thinkingLevel?: string,
  modelStr?: string,
  outputPath?: string,
  timeoutSec?: number,
  skillPaths?: string[],
): Promise<void> {
  if (thinkingLevel && !THINKING_LEVELS.includes(thinkingLevel as ThinkingLevel)) {
    throw new Error(`Thinking level non valido: "${thinkingLevel}". Valori accettati: ${THINKING_LEVELS.join(", ")}`);
  }

  let model;
  if (modelStr) {
    const [provider, ...rest] = modelStr.split("/");
    const modelId = rest.join("/");
    if (!provider || !modelId) throw new Error(`Formato model non valido: usa "provider/model-id" (es. anthropic/claude-opus-4-5)`);
    const knownProviders = getProviders();
    if (!knownProviders.includes(provider as KnownProvider)) {
      throw new Error(`Provider non valido: "${provider}". Provider disponibili: ${knownProviders.join(", ")}`);
    }
    model = getModel(provider as KnownProvider, modelId as never);
    if (!model) throw new Error(`Model non trovato: "${modelStr}". Usa: th models`);
  }
  const { member, systemPrompt } = loadMember(memberName);

  const injectedSkills: Skill[] = (skillPaths ?? []).map(loadSkillFromPath);

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
    skillsOverride: (current) => {
      const filtered = member.skills.length > 0
        ? current.skills.filter((s) => member.skills.includes(s.name))
        : current.skills;
      return { skills: [...filtered, ...injectedSkills], diagnostics: current.diagnostics };
    },
  });
  await loader.reload();

  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  const { session } = await createAgentSession({
    tools: member.tools,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    ...(model ? { model } : {}),
    ...(thinkingLevel ? { thinkingLevel: thinkingLevel as ThinkingLevel } : {}),
  });

  const paths = outputPath
    ? { out: outputPath, log: outputPath.replace(/\.out$/, ".log"), status: outputPath.replace(/\.out$/, ".status") }
    : makeJobPaths(memberName);
  const logPath = paths.log;
  const statusPath = outputPath ? paths.status : null;

  const logFd = openSync(logPath, "w");
  const outputFd = outputPath ? openSync(outputPath, "w") : null;

  const log = (text: string) => writeSync(logFd, text);
  const emit = (text: string) => {
    process.stdout.write(text);
    if (outputFd !== null) writeSync(outputFd, text);
  };

  session.subscribe((event) => {
    if (event.type === "message_update") {
      const e = event.assistantMessageEvent;
      if (e.type === "text_delta") {
        emit(e.delta);
      } else if (e.type === "thinking_delta") {
        log(e.delta);
      }
    } else if (event.type === "tool_execution_start") {
      log(`\n[tool:${event.toolName}] ${JSON.stringify(event.args)}\n`);
    } else if (event.type === "tool_execution_end") {
      const raw = event.isError ? `ERROR: ${JSON.stringify(event.result)}` : JSON.stringify(event.result);
      log(`[tool:${event.toolName}] → ${truncate(raw, LOG_RESULT_MAX)}\n`);
    }
  });

  process.stderr.write(`log: ${logPath}\n`);
  if (outputPath) process.stderr.write(`output: ${outputPath}\n`);

  try {
    const promptPromise = session.prompt(task);

    if (timeoutSec) {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout dopo ${timeoutSec}s`)), timeoutSec * 1000)
      );
      try {
        await Promise.race([promptPromise, timeoutPromise]);
      } catch (err) {
        await session.abort();
        throw err;
      }
    } else {
      await promptPromise;
    }

    emit("\n");
    if (statusPath) writeFileSync(statusPath, "done");
  } catch (err) {
    if (statusPath) writeFileSync(statusPath, `error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    closeSync(logFd);
    if (outputFd !== null) closeSync(outputFd);
  }
}
