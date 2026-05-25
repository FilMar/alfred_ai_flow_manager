import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Member } from "./types.js";

// ─── Percorsi ─────────────────────────────────────────────────────────────────

const HATS_DIR = "../hats";
const MEMBERS_DIR = () => join(process.cwd(), ".th", "members");
const TMP_MEMBERS_DIR = () => join("/tmp", ".th", "members");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadHat(hat: string): string {
  const hatPath = join(HATS_DIR, `${hat}.md`);
  if (!existsSync(hatPath)) {
    const available = readdirSync(HATS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""));
    throw new Error(`Hat "${hat}" non trovato. Disponibili: ${available.join(", ")}`);
  }
  return readFileSync(hatPath, "utf-8");
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  return Object.fromEntries(
    match[1].split("\n").flatMap((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return [];
      return [[line.slice(0, idx).trim(), line.slice(idx + 1).trim()]];
    })
  );
}

// ─── API ──────────────────────────────────────────────────────────────────────

export function createMember(name: string, hat: string, role: string, tools: string[], skills: string[], tmp = false): Member {
  const dir = tmp ? TMP_MEMBERS_DIR() : MEMBERS_DIR();
  const memberPath = join(dir, `${name}.md`);

  if (existsSync(memberPath)) throw new Error(`Membro "${name}" esiste già.`);

  const hatContent = loadHat(hat);

  const content = [
    `---`,
    `name: ${name}`,
    `hat: ${hat}`,
    `tools: [${tools.join(", ")}]`,
    `skills: [${skills.join(", ")}]`,
    `---`,
    ``,
    `## Ruolo`,
    ``,
    role,
    ``,
    `---`,
    ``,
    hatContent.trim(),
  ].join("\n");

  mkdirSync(dir, { recursive: true });
  writeFileSync(memberPath, content, "utf-8");

  return { name, hat, tools, skills };
}

export function listMembers(): Member[] {
  const dir = MEMBERS_DIR();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = readFileSync(join(dir, f), "utf-8");
      const meta = parseFrontmatter(content);
      const tools = meta.tools
        ? meta.tools.replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean)
        : [];
      const skills = meta.skills
        ? meta.skills.replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean)
        : [];
      return { name: meta.name ?? f.replace(".md", ""), hat: meta.hat ?? "", tools, skills };
    });
}

function resolveMemberPath(name: string): string {
  const local = join(MEMBERS_DIR(), `${name}.md`);
  if (existsSync(local)) return local;
  const tmp = join(TMP_MEMBERS_DIR(), `${name}.md`);
  if (existsSync(tmp)) return tmp;
  throw new Error(`Membro "${name}" non trovato (cercato in .th/members/ e /tmp/.th/members/).`);
}

function parseMember(name: string, content: string): Member {
  const meta = parseFrontmatter(content);
  const tools = meta.tools
    ? meta.tools.replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const skills = meta.skills
    ? meta.skills.replace(/^\[|\]$/g, "").split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  return { name, hat: meta.hat ?? "", tools, skills };
}

export function getMember(name: string): Member {
  const memberPath = resolveMemberPath(name);
  return parseMember(name, readFileSync(memberPath, "utf-8"));
}

export function getMemberSystemPrompt(name: string): string {
  const memberPath = resolveMemberPath(name);
  const content = readFileSync(memberPath, "utf-8");
  return content.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}
