import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Note, NoteUpdate, SearchOptions } from "./types.js";
import { noteToText } from "./types.js";
import { checkHealth, fixCommands, getHealthCached, missingServices, warnIfUnhealthy } from "./health.js";
import { embed } from "./embed.js";
import { ensureCollection, upsert, search, updateNote, randomNoteId, noteId, getByIds } from "./qdrant.js";
import { NoteTypeSchema, RelationTypeSchema } from "./schemas.js";
import { textResponse, errorResponse } from "./responses.js";

export default function registerThirdBrainExtension(pi: ExtensionAPI): void {

  async function requireServices(options?: { needsEmbedding?: boolean }) {
    const health = await getHealthCached();
    const missing = missingServices(health, options);

    if (missing.length === 0) {
      return null;
    }

    const commands = fixCommands(health, options);
    const commandsText = commands.length > 0
      ? `\nComandi per il fix:\n${commands.map((command) => `  • ${command}`).join("\n")}`
      : "";

    return errorResponse(
      `[third-brain] Servizi non disponibili: ${missing.join(", ")}.${commandsText}`,
    );
  }

  // ─── Healthcheck all'avvio ───────────────────────────────────────────────
  // Fire-and-forget: non blocca il caricamento dell'estensione.
  checkHealth()
    .then(warnIfUnhealthy)
    .catch((err) => {
      console.error("[third-brain] Health check failed:", err instanceof Error ? err.message : String(err));
    });

  // ─── third_brain_save ────────────────────────────────────────────────────

  pi.registerTool({
    name: "third_brain_save",
    label: "Third Brain Save",
    description:
      "Salva un'idea atomica nella memoria persistente. " +
      "Genera automaticamente id, timestamp e un correlato casuale seed. " +
      "Il contenuto è immutabile dopo la creazione.",
    parameters: Type.Object({
      why: Type.String({ description: "Contesto: perché questa nota è nata" }),
      what: Type.String({ description: "Contenuto: l'idea atomica da ricordare" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Etichette per filtro" })),
      kind: Type.Optional(NoteTypeSchema),
      source: Type.Optional(Type.String({ description: "URI o riferimento alla fonte originale" })),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const unavailable = await requireServices({ needsEmbedding: true });
      if (unavailable) return unavailable;

      const when = new Date().toISOString();
      const id = noteId(params.what, when);

      // Correlato casuale seed
      const seedId = await randomNoteId();
      let seedContent = "";

      if (seedId) {
        const notes = await getByIds([seedId]);
        if (notes.length > 0) {
          const sn = notes[0];
          seedContent = `\n\n--- Seed Serendipity ---\nID: ${seedId}\nWhat: ${sn.what}\nWhy: ${sn.why}\n-----------------------`;
        }
      }

      const note: Note = {
        id,
        when,
        why: params.why,
        what: params.what,
        tags: params.tags ?? [],
        kind: params.kind ?? "dato",
        ...(params.source && { source: params.source }),
        refs: seedId
          ? [{ id: seedId, reason: "correlato iniziale — connessione da esplorare" }]
          : [],
      };

      await ensureCollection();
      const vector = await embed(noteToText(note));
      await upsert(note, vector);

      const seedMsg = seedId
        ? `Correlato seed: ${seedId}${seedContent}\n\n[SFIDA DI SERENDIPITÀ]: Platone, inventa un ponte creativo, inatteso o ipotetico tra questa nuova nota e il seed. Sostituisci il motivo generico con una correlazione che stimoli il pensiero laterale.`
        : "Prima nota — nessun correlato seed disponibile.";

      return textResponse(`Nota salvata.\nID: ${id}\n${seedMsg}`, { note });
    },
  });

  // ─── third_brain_search ──────────────────────────────────────────────────

  pi.registerTool({
    name: "third_brain_search",
    label: "Third Brain Search",
    description:
      "Ricerca semantica nella memoria. " +
      "Accetta una query in linguaggio naturale, la converte in vettore e trova le note più rilevanti.",
    parameters: Type.Object({
      query: Type.String({ description: "Query in linguaggio naturale" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Filtra per tag (OR)" })),
      kind: Type.Optional(
        Type.Array(NoteTypeSchema, { description: "Filtra per tipo semantico (OR)" }),
      ),
      limit: Type.Optional(Type.Number({ description: "Numero massimo di risultati. Default: 10." })),
      depth: Type.Optional(Type.Number({ description: "Profondità traversal refs. 0 = solo vettoriale. 1 = +refs diretti (default). 2 = +refs dei refs." })),
      hybrid: Type.Optional(Type.Boolean({ description: "Se true, usa hybrid retrieval (dense + sparse + RRF). Più lento ma migliore per query keyword-heavy." })),
      evidence_only: Type.Optional(Type.Boolean({ description: "Se true, restringe la ricerca ai soli tipi evidence-oriented: osservazione, lemma." })),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const unavailable = await requireServices({ needsEmbedding: true });
      if (unavailable) return unavailable;

      const options: SearchOptions = {
        tags: params.tags,
        kind: params.kind as SearchOptions["kind"],
        limit: params.limit,
        depth: params.depth,
        hybrid: params.hybrid,
        evidence_only: params.evidence_only,
        query_text: params.query,
      };

      await ensureCollection();
      const vector = await embed(params.query);
      const results = await search(vector, options);

      if (results.length === 0) {
        return textResponse("Nessuna nota trovata.", { results: [] });
      }

      const text = results
        .map(
          (r, i) =>
            `${i + 1}. [${r.via === "search" ? r.score.toFixed(3) : "correlato"}] ${r.note.id} (${r.note.kind})\n` +
            `   why: ${r.note.why}\n` +
            `   what: ${r.note.what}\n` +
            `   tags: ${r.note.tags.join(", ") || "—"}`,
        )
        .join("\n\n");

      return textResponse(text, { results });
    },
  });

  // ─── third_brain_update ──────────────────────────────────────────────────

  pi.registerTool({
    name: "third_brain_update",
    label: "Third Brain Update",
    description:
      "Aggiorna i campi mutabili di una nota: `kind` e/o `refs`. I refs vengono sovrascritti integralmente.",
    parameters: Type.Object({
      id: Type.String({ description: "ID della nota da aggiornare" }),
      kind: Type.Optional(NoteTypeSchema),
      refs: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String({ description: "ID della nota collegata" }),
            reason: Type.String({ description: "Ragione esplicita del collegamento" }),
            relation: Type.Optional(RelationTypeSchema),
          }),
          { description: "Lista completa dei refs (sovrascrive quella esistente)" },
        ),
      ),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const unavailable = await requireServices({ needsEmbedding: false });
      if (unavailable) return unavailable;

      const patch: NoteUpdate = {};
      if (params.kind) patch.kind = params.kind;
      if (params.refs) patch.refs = params.refs;

      if (Object.keys(patch).length === 0) {
        return errorResponse("Nessun campo da aggiornare specificato.");
      }

      await updateNote(params.id, patch);

      const updated = Object.keys(patch).join(", ");
      return textResponse(`Nota ${params.id} aggiornata (${updated}).`, { id: params.id, patch });
    },
  });

  // ─── /remember ───────────────────────────────────────────────────────────

  pi.registerCommand("remember", {
    description: "Estrai le idee atomiche interessanti dalla sessione corrente e salvale nel third brain",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agente occupato — riprova tra poco", "warning");
        return;
      }
      pi.sendUserMessage(
        "Attiva la skill third-brain: leggi l'intera sessione corrente ed estrai le idee atomiche e interessanti. Salvale nel third brain una per una.",
      );
    },
  });
}
