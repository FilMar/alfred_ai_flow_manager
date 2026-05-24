#!/usr/bin/env bun
import { Command } from "commander";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkHealth, EMBED_MODEL } from "./infra.js";
import { createNote, addRefs, changeKind, searchNotes, browseNotes, randomNote, listNoteTags } from "./notes.js";
import { serveGraph, GRAPH_PORT_FILE } from "./graph.js";
import type { NoteType, SearchOptions } from "./types.js";
import { NOTE_TYPES } from "./types.js";

// ─── Percorso compose ─────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const COMPOSE_FILE = resolve(__dirname, "../../../scripts/compose.qdrant.yml");

const QDRANT_POLL_RETRIES = 10;
const QDRANT_POLL_INTERVAL_MS = 1_000;

// ─── Output helpers ───────────────────────────────────────────────────────────

function out(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

function die(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

// ─── Health guard ─────────────────────────────────────────────────────────────

async function requireServices(opts: { needsEmbedding?: boolean } = {}): Promise<void> {
  const status = await checkHealth();
  const missing: string[] = [];

  if (!status.qdrant) missing.push("Qdrant");
  if (opts.needsEmbedding !== false) {
    if (!status.ollama) missing.push("Ollama");
    else if (!status.model) missing.push(`modello ${EMBED_MODEL}`);
  }

  if (missing.length > 0) {
    die(`Servizi non disponibili: ${missing.join(", ")}.\nAvvia i servizi con: tb start`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

function normalizeTags(tags: string[]): string[] {
  return tags.flatMap((t) => t.split(",").map((s) => s.trim())).filter(Boolean);
}

function validateKind(kind: string): asserts kind is NoteType {
  if (!NOTE_TYPES.includes(kind as NoteType)) {
    die(`kind non valido: "${kind}". Valori ammessi: ${NOTE_TYPES.join(", ")}`);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function notifyGraph(ids: string[]): Promise<void> {
  try {
    const port = readFileSync(GRAPH_PORT_FILE, "utf8").trim();
    await fetch(`http://localhost:${port}/highlight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(400),
    });
  } catch {
    // graph server not running — silent
  }
}

// ─── Programma ────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("tb")
  .description("CLI per la memoria semantica del Third Brain")
  .version("0.1.0");

// ─── start ────────────────────────────────────────────────────────────────────

program
  .command("start")
  .description("Avvia Qdrant via Docker Compose e verifica Ollama")
  .action(async () => {
    const result = spawnSync("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"], { stdio: "inherit" });
    if (result.status !== 0) die("docker compose up fallito. Verifica che Docker o Podman sia in esecuzione.");

    let qdrantUp = false;
    for (let i = 0; i < QDRANT_POLL_RETRIES; i++) {
      const status = await checkHealth();
      if (status.qdrant) { qdrantUp = true; break; }
      await new Promise((r) => setTimeout(r, QDRANT_POLL_INTERVAL_MS));
    }

    if (!qdrantUp) {
      process.stderr.write("Qdrant avviato ma non ancora raggiungibile. Riprova tra qualche secondo.\n");
      process.exit(1);
    }

    const final = await checkHealth();
    out({ qdrant: final.qdrant, ollama: final.ollama, model: final.model });

    if (!final.ollama) process.stderr.write("Ollama non raggiungibile. Avvialo con: ollama serve\n");
    else if (!final.model) process.stderr.write(`Modello mancante. Scaricalo con: ollama pull ${EMBED_MODEL}\n`);
  });

// ─── stop ─────────────────────────────────────────────────────────────────────

program
  .command("stop")
  .description("Ferma Qdrant")
  .action(() => {
    const result = spawnSync("docker", ["compose", "-f", COMPOSE_FILE, "down"], { stdio: "inherit" });
    process.exit(result.status ?? 1);
  });

// ─── status ───────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Mostra stato di Qdrant e Ollama")
  .action(async () => {
    const status = await checkHealth();
    out(status);
    if (!status.qdrant || !status.ollama || !status.model) process.exit(1);
  });

// ─── save ─────────────────────────────────────────────────────────────────────

program
  .command("save")
  .description("Salva un'idea atomica nel Third Brain")
  .requiredOption("--what <text>", "Contenuto: l'idea atomica")
  .requiredOption("--why <text>", "Contesto: perché questa nota è nata")
  .option("--kind <kind>", "Tipo semantico (dato|protocollo|sintesi|attrito|configurazione|indice)", "dato")
  .option("--tags <tag>", "Etichetta (ripetibile)", collect, [] as string[])
  .option("--source <uri>", "URI o riferimento alla fonte originale")
  .action(async (opts) => {
    validateKind(opts.kind);
    await requireServices({ needsEmbedding: true });

    const note = await createNote({
      what: opts.what,
      why: opts.why,
      kind: opts.kind,
      tags: normalizeTags(opts.tags),
      source: opts.source,
    });

    out({ id: note.id });
  });

// ─── tags ─────────────────────────────────────────────────────────────────────

program
  .command("tags")
  .description("Lista i tag in uso, ordinati per frequenza")
  .action(async () => {
    await requireServices({ needsEmbedding: false });
    const tags = await listNoteTags();
    out(tags);
  });

// ─── random ───────────────────────────────────────────────────────────────────

program
  .command("random")
  .description("Restituisce una nota casuale dal Third Brain")
  .action(async () => {
    await requireServices({ needsEmbedding: false });
    const note = await randomNote();
    if (!note) die("Nessuna nota nel Third Brain.");
    out(note);
  });

// ─── search ───────────────────────────────────────────────────────────────────

program
  .command("search <query>")
  .description("Ricerca semantica nel Third Brain")
  .option("--limit <n>", "Numero massimo di risultati", "10")
  .option("--depth <n>", "Profondità traversal refs (0=solo vettoriale, 1=default)", "1")
  .option("--hybrid", "Usa hybrid retrieval (dense + sparse + RRF)")
  .option("--tags <tag>", "Filtra per tag (ripetibile)", collect, [] as string[])
  .option("--kind <kind>", "Filtra per tipo semantico (ripetibile)", collect, [] as string[])
  .option("--evidence-only", "Restringe ai tipi evidence-oriented")
  .option("--include-hubs", "Includi note di tipo indice nella ricerca")
  .action(async (query: string, opts) => {
    await requireServices({ needsEmbedding: true });

    const options: SearchOptions = {
      limit: parseInt(opts.limit, 10),
      depth: parseInt(opts.depth, 10),
      hybrid: opts.hybrid ?? false,
      tags: opts.tags.length ? normalizeTags(opts.tags) : undefined,
      kind: opts.kind.length ? (opts.kind as NoteType[]) : undefined,
      evidence_only: opts.evidenceOnly ?? false,
      include_hubs: opts.includeHubs ?? false,
    };

    const results = await searchNotes(query, options);
    out(results);
    void notifyGraph(results.map((r) => r.note.id));
  });

// ─── update ───────────────────────────────────────────────────────────────────

program
  .command("update <id>")
  .description("Aggiorna i campi mutabili di una nota")
  .option("--kind <kind>", "Nuovo tipo semantico")
  .option("--add-ref <id:reason>", "Aggiunge un ref (ripetibile, append-only)", collect, [] as string[])
  .action(async (id: string, opts) => {
    await requireServices({ needsEmbedding: false });

    let updated = false;

    if (opts.kind) {
      validateKind(opts.kind);
      try {
        await changeKind(id, opts.kind);
        updated = true;
      } catch (err) {
        die(errorMessage(err));
      }
    }

    if (opts.addRef.length > 0) {
      const newRefs = opts.addRef.map((raw: string) => {
        const colonIdx = raw.indexOf(":");
        if (colonIdx === -1) die(`Formato --add-ref non valido: "${raw}". Atteso: <id:reason>`);
        return { id: raw.slice(0, colonIdx), reason: raw.slice(colonIdx + 1) };
      });

      try {
        await addRefs(id, newRefs);
        updated = true;
      } catch (err) {
        die(errorMessage(err));
      }
    }

    if (!updated) die("Nessun campo da aggiornare. Usa --kind o --add-ref.");

    out({ id, updated: true });
  });

// ─── browse ───────────────────────────────────────────────────────────────────

program
  .command("browse")
  .description("Naviga la memoria senza query semantica (scroll)")
  .option("--kind <kind>", "Filtra per tipo semantico")
  .option("--since <date>", "Data ISO minima di creazione (es. 2025-01-01)")
  .option("--limit <n>", "Numero massimo di risultati", "20")
  .action(async (opts) => {
    await requireServices({ needsEmbedding: false });

    if (opts.kind) validateKind(opts.kind);

    const notes = await browseNotes({
      kind: opts.kind as NoteType | undefined,
      since: opts.since,
      limit: parseInt(opts.limit, 10),
    });

    out(notes);
  });

// ─── graph ────────────────────────────────────────────────────────────────────

program
  .command("graph")
  .description("Visualizza il grafo del Third Brain nel browser (PCA 2D + WebSocket)")
  .option("--port <n>", "Porta del server HTTP", "7333")
  .action(async (opts) => {
    await requireServices({ needsEmbedding: false });
    try {
      await serveGraph(parseInt(opts.port, 10));
    } catch (err) {
      die(errorMessage(err));
    }
  });

// ─── Parse ───────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  die(errorMessage(err));
});
