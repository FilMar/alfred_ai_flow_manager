import { openSync, writeSync, closeSync } from "node:fs";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getModel, getProviders } from "@earendil-works/pi-ai";
import type { KnownProvider } from "@earendil-works/pi-ai";
import { loadMember } from "./members.js";

// ─── API ──────────────────────────────────────────────────────────────────────

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const LOG_RESULT_MAX = 500;

export async function listAvailableModels(): Promise<Array<{ provider: string; id: string; name: string }>> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const available = await modelRegistry.getAvailable();
  return available.map((m) => ({ provider: m.provider, id: m.id, name: m.name }));
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

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
    skillsOverride:
      member.skills.length > 0
        ? (current) => ({
            skills: current.skills.filter((s) => member.skills.includes(s.name)),
            diagnostics: current.diagnostics,
          })
        : undefined,
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

  const logPath = `/tmp/th-${memberName}-${Date.now()}.log`;
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
  } finally {
    closeSync(logFd);
    if (outputFd !== null) closeSync(outputFd);
  }
}
