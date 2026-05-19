import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const HATS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../hats");
export async function loadHat(hatId) {
    return fs.readFile(path.join(HATS_DIR, `${hatId}.md`), "utf-8");
}
export function buildSystemPrompt(role, personality, hatContent, thread) {
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
