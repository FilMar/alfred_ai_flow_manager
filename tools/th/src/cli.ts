#!/usr/bin/env bun
import { Command } from "commander";
import { createMember, listMembers } from "./members.js";
import { runMember } from "./runner.js";

// ─── Output helpers ───────────────────────────────────────────────────────────

function out(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

function die(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

// ─── Programma ────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("th")
  .description("CLI per l'orchestrazione di agenti — Third Hand")
  .version("0.1.0");

// ─── member ───────────────────────────────────────────────────────────────────

const member = new Command("member").description("Gestione membri");

member
  .command("create <name>")
  .description("Crea un nuovo membro")
  .requiredOption("--hat <hat>", "Cappello de Bono (es. blue-core, black-core)")
  .requiredOption("--role <role>", "Descrizione del ruolo del membro")
  .option("--tools <tools>", "Tool disponibili separati da virgola", "read,bash")
  .option("--skills <skills>", "Skill da iniettare separati da virgola (es. oracolo,platone)", "")
  .option("--tmp", "Crea il membro in /tmp invece che nel progetto corrente")
  .action((name: string, opts: { hat: string; role: string; tools: string; skills: string; tmp?: boolean }) => {
    const tools = opts.tools.split(",").map((t) => t.trim()).filter(Boolean);
    const skills = opts.skills.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      const m = createMember(name, opts.hat, opts.role, tools, skills, opts.tmp);
      out(m);
    } catch (err) {
      die(err instanceof Error ? err.message : String(err));
    }
  });

member
  .command("list")
  .description("Lista membri disponibili nel progetto corrente")
  .action(() => {
    const members = listMembers();
    if (members.length === 0) die("Nessun membro. Usa: th member create <name>");
    out(members);
  });

program.addCommand(member);

// ─── run ──────────────────────────────────────────────────────────────────────

program
  .command("run")
  .description("Esegue un task con un singolo membro")
  .requiredOption("--member <name>", "Nome del membro")
  .requiredOption("--task <task>", "Task da eseguire")
  .action(async (opts: { member: string; task: string }) => {
    try {
      await runMember(opts.member, opts.task);
    } catch (err) {
      die(err instanceof Error ? err.message : String(err));
    }
  });

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  die(err instanceof Error ? err.message : String(err));
});
