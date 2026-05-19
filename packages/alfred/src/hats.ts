import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { HatId } from "./types.js";

const HATS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../hats");

export async function loadHat(hatId: HatId): Promise<string> {
  return fs.readFile(path.join(HATS_DIR, `${hatId}.md`), "utf-8");
}

export function buildSystemPrompt(
  role: string,
  personality: string,
  hatContent: string,
  thread: string,
): string {
  const parts = [
    `# Identità`,
    `**Ruolo:** ${role}`,
    `**Personalità:** ${personality}`,
    ``,
    `# Protocollo Cognitivo`,
    hatContent,
  ];

  if (thread) {
    parts.push(``, `# Thread del Debate (contributi precedenti)`, thread);
  }

  return parts.join("\n");
}
