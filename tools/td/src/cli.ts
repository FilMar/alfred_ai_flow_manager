#!/usr/bin/env bun
import { Command } from "commander";
import { randomUUID } from "node:crypto";
import {
  insertProject, getProject, getProjectByName, listProjects, updateProject, taskCountByProject,
  insertTask, getTask, listTasks, moveTask, doneTask, updateTaskData,
} from "./db.js";
import { LISTS, type List } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function die(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function err(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function validateList(v: string): List {
  if (!LISTS.includes(v as List)) die(`Lista non valida: "${v}". Valori: ${LISTS.join(", ")}`);
  return v as List;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function printTask(t: ReturnType<typeof getTask> & object, projectName?: string): void {
  const d = t.data as Record<string, unknown>;
  const what = String(d.what ?? "—");
  const ctx = d.context ? ` @${d.context}` : "";
  const due = d.due ? ` (due: ${d.due})` : "";
  const proj = projectName ? ` [${projectName}]` : "";
  const waiting = d.waiting_for ? ` ← ${d.waiting_for}` : "";
  process.stdout.write(`  ${shortId(t.id)}  ${what}${ctx}${due}${proj}${waiting}\n`);
}

// ─── Programma ───────────────────────────────────────────────────────────────

const program = new Command();
program.name("td").description("Third Done — GTD personale").version("0.1.0");

// ─── project ─────────────────────────────────────────────────────────────────

const project = new Command("project").description("Gestione progetti");

project
  .command("add <name>")
  .description("Crea un nuovo progetto")
  .option("--goal <text>", "Obiettivo del progetto")
  .option("--goal-end <date>", "Scadenza target (YYYY-MM-DD)")
  .action((name: string, opts) => {
    try {
      if (getProjectByName(name)) die(`Progetto "${name}" esiste già`);
      const p = {
        id: randomUUID(),
        name,
        start: today(),
        goal_end: opts.goalEnd,
        data: { goal: opts.goal ?? "" },
      };
      insertProject(p);
      process.stdout.write(`Progetto creato: ${shortId(p.id)}  ${name}\n`);
    } catch (e) { die(err(e)); }
  });

project
  .command("list")
  .description("Lista progetti attivi")
  .option("--all", "Includi completati")
  .action((opts) => {
    const projects = listProjects(opts.all);
    if (!projects.length) { process.stdout.write("Nessun progetto.\n"); return; }
    for (const p of projects) {
      const counts = taskCountByProject(p.id);
      const goal = (p.data as Record<string, unknown>).goal ? ` — ${p.data.goal}` : "";
      const end = p.real_end ? ` ✓ ${p.real_end}` : p.goal_end ? ` → ${p.goal_end}` : "";
      process.stdout.write(`  ${shortId(p.id)}  ${p.name}${goal}${end}  [${counts.active} attivi, ${counts.done} fatti]\n`);
    }
  });

project
  .command("done <id-or-name>")
  .description("Chiudi un progetto")
  .action((idOrName: string) => {
    try {
      const p = getProject(idOrName) ?? getProjectByName(idOrName);
      if (!p) die(`Progetto non trovato: "${idOrName}"`);
      updateProject(p.id, { real_end: today() });
      process.stdout.write(`Progetto chiuso: ${p.name}\n`);
    } catch (e) { die(err(e)); }
  });

program.addCommand(project);

// ─── add ─────────────────────────────────────────────────────────────────────

program
  .command("add <what>")
  .description("Aggiunge un task (default: inbox)")
  .option("--list <list>", "Lista destinazione", "inbox")
  .option("--project <name>", "Nome progetto")
  .option("--context <ctx>", "Contesto (@phone, @computer, ...)")
  .option("--due <date>", "Scadenza (YYYY-MM-DD)")
  .option("--waiting-for <who>", "In attesa di")
  .option("--notes <text>", "Note libere")
  .action((what: string, opts) => {
    try {
      const list = validateList(opts.list);
      let project_id: string | undefined;
      if (opts.project) {
        const p = getProjectByName(opts.project);
        if (!p) die(`Progetto "${opts.project}" non trovato. Crealo con: td project add "${opts.project}"`);
        project_id = p.id;
      }
      const data: Record<string, unknown> = { what };
      if (opts.context) data.context = opts.context;
      if (opts.due) data.due = opts.due;
      if (opts.waitingFor) data.waiting_for = opts.waitingFor;
      if (opts.notes) data.notes = opts.notes;

      const t = { id: randomUUID(), list, project_id, created_at: now(), data };
      insertTask(t);
      process.stdout.write(`Task aggiunto: ${shortId(t.id)}  ${what}\n`);
    } catch (e) { die(err(e)); }
  });

// ─── Liste di visualizzazione ─────────────────────────────────────────────────

function listCommand(listName: List, description: string): Command {
  return new Command(listName)
    .description(description)
    .option("--project <name>", "Filtra per progetto")
    .action(async (opts) => {
      try {
        let project_id: string | undefined;
        if (opts.project) {
          const p = getProjectByName(opts.project);
          if (!p) die(`Progetto "${opts.project}" non trovato`);
          project_id = p.id;
        }
        const tasks = listTasks({ list: listName, project_id });
        if (!tasks.length) { process.stdout.write(`Nessun task in ${listName}.\n`); return; }
        process.stdout.write(`\n${listName.toUpperCase()} (${tasks.length})\n`);
        for (const t of tasks) {
          const pName = t.project_id ? getProject(t.project_id)?.name : undefined;
          printTask(t as NonNullable<typeof t>, pName);
        }
        process.stdout.write("\n");
      } catch (e) { die(err(e)); }
    });
}

program.addCommand(listCommand("inbox", "Mostra inbox"));
program.addCommand(listCommand("next", "Mostra next actions"));
program.addCommand(listCommand("waiting", "Mostra waiting for"));
program.addCommand(listCommand("someday", "Mostra someday/maybe"));

// ─── move ────────────────────────────────────────────────────────────────────

program
  .command("move <id> <list>")
  .description("Sposta un task in un'altra lista")
  .action((id: string, list: string) => {
    try {
      const l = validateList(list);
      const t = getTask(id) ?? listTasks({ includeDone: true }).find(t => t.id.startsWith(id));
      if (!t) die(`Task non trovato: "${id}"`);
      moveTask(t.id, l);
      process.stdout.write(`Spostato in ${l}: ${shortId(t.id)}\n`);
    } catch (e) { die(err(e)); }
  });

// ─── done ────────────────────────────────────────────────────────────────────

program
  .command("done <id>")
  .description("Marca un task come completato")
  .action((id: string) => {
    try {
      const t = getTask(id) ?? listTasks().find(t => t.id.startsWith(id));
      if (!t) die(`Task non trovato: "${id}"`);
      doneTask(t.id);
      process.stdout.write(`Fatto: ${String((t.data as Record<string, unknown>).what ?? t.id)}\n`);
    } catch (e) { die(err(e)); }
  });

// ─── list ────────────────────────────────────────────────────────────────────

program
  .command("list")
  .description("Tutti i task attivi, raggruppati per lista")
  .option("--project <name>", "Filtra per progetto")
  .option("--all", "Includi completati")
  .action((opts) => {
    try {
      let project_id: string | undefined;
      if (opts.project) {
        const p = getProjectByName(opts.project);
        if (!p) die(`Progetto "${opts.project}" non trovato`);
        project_id = p.id;
      }
      const tasks = listTasks({ project_id, includeDone: opts.all });
      if (!tasks.length) { process.stdout.write("Nessun task.\n"); return; }

      for (const list of LISTS) {
        const group = tasks.filter(t => t.list === list);
        if (!group.length) continue;
        process.stdout.write(`\n${list.toUpperCase()} (${group.length})\n`);
        for (const t of group) {
          const pName = t.project_id ? getProject(t.project_id)?.name : undefined;
          printTask(t as NonNullable<typeof t>, pName);
        }
      }
      process.stdout.write("\n");
    } catch (e) { die(err(e)); }
  });

// ─── get ─────────────────────────────────────────────────────────────────────

program
  .command("get <id>")
  .description("Dettaglio di un task")
  .action((id: string) => {
    try {
      const t = getTask(id) ?? listTasks({ includeDone: true }).find(t => t.id.startsWith(id));
      if (!t) die(`Task non trovato: "${id}"`);
      const p = t.project_id ? getProject(t.project_id) : null;
      process.stdout.write(JSON.stringify({ ...t, project: p?.name }, null, 2) + "\n");
    } catch (e) { die(err(e)); }
  });

// ─── Parse ───────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((e) => die(err(e)));
