#!/usr/bin/env bun
import { Command } from "commander";
import { createMember, deleteMember, getHat, getMember, listHats, listMembers } from "./members.js";
import { listAvailableModels, runMember } from "./runner.js";

// ─── Output helpers ───────────────────────────────────────────────────────────

function out(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

function die(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function splitCSV(val: string): string[] {
  return val.split(",").map((s) => s.trim()).filter(Boolean);
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
  .action((name: string, opts) => {
    const tools = splitCSV(opts.tools);
    const skills = splitCSV(opts.skills);
    try {
      const m = createMember(name, opts.hat, opts.role, tools, skills, opts.tmp);
      out(m);
    } catch (err) {
      die(errorMessage(err));
    }
  });

member
  .command("list")
  .description("Lista membri del progetto corrente")
  .option("--all", "Includi anche i membri temporanei in /tmp")
  .action((opts) => {
    const result = listMembers(opts.all);
    if (result.length === 0) die("Nessun membro. Usa: th member create <name>");
    out(result);
  });

member
  .command("get <name>")
  .description("Mostra il dettaglio di un membro")
  .action((name: string) => {
    try {
      out(getMember(name));
    } catch (err) {
      die(errorMessage(err));
    }
  });

member
  .command("delete <name>")
  .description("Elimina un membro")
  .action((name: string) => {
    try {
      deleteMember(name);
      out({ deleted: true, name });
    } catch (err) {
      die(errorMessage(err));
    }
  });

program.addCommand(member);

// ─── hats ─────────────────────────────────────────────────────────────────────

const hats = new Command("hats").description("Gestione cappelli de Bono");

hats
  .command("list")
  .description("Lista i cappelli disponibili")
  .action(() => out(listHats()));

hats
  .command("get <name>")
  .description("Mostra il contenuto di un cappello")
  .action((name: string) => {
    try {
      // raw markdown — intentionally not JSON
      process.stdout.write(getHat(name) + "\n");
    } catch (err) {
      die(errorMessage(err));
    }
  });

program.addCommand(hats);

// ─── run ──────────────────────────────────────────────────────────────────────

program
  .command("run")
  .description("Esegue un task con un singolo membro")
  .requiredOption("--member <name>", "Nome del membro")
  .requiredOption("--task <task>", "Task da eseguire")
  .option("--thinking <level>", "Livello di thinking esteso (off, minimal, low, medium, high, xhigh)")
  .option("--model <provider/id>", "Modello da usare (es. anthropic/claude-opus-4-7)")
  .option("--output <file>", "Salva il risultato su file (oltre che su stdout)")
  .option("--timeout <secondi>", "Timeout in secondi — aborta la sessione se superato", (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n <= 0) throw new Error(`--timeout deve essere un intero positivo (ricevuto: "${v}")`);
    return n;
  })
  .action(async (opts) => {
    try {
      await runMember(opts.member, opts.task, opts.thinking, opts.model, opts.output, opts.timeout);
    } catch (err) {
      die(errorMessage(err));
    }
  });

// ─── models ───────────────────────────────────────────────────────────────────

program
  .command("models")
  .description("Lista i modelli disponibili (con API key configurata)")
  .action(async () => {
    try {
      const models = await listAvailableModels();
      if (models.length === 0) die("Nessun modello disponibile. Configura una API key.");
      out(models);
    } catch (err) {
      die(errorMessage(err));
    }
  });

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  die(errorMessage(err));
});
