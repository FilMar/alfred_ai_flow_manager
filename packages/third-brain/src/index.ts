import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Note, NoteInput, NoteUpdate, SearchOptions } from "./types.js";
import { checkHealth, fixCommands, getHealthCached, missingServices, warnIfUnhealthy } from "./health.js";
import { embed } from "./embed.js";
import { ensureCollection, upsert, search, updateNote, randomNoteId, noteId } from "./qdrant.js";
import { NoteStateSchema, NoteTypeSchema, RelazioneTypeSchema } from "./schemas.js";
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
      "Genera automaticamente id, timestamp, stato iniziale ('fertile') e un correlato casuale seed. " +
      "Il contenuto è immutabile dopo la creazione.",
    parameters: Type.Object({
      why: Type.String({ description: "Contesto: perché questa idea è nata" }),
      what: Type.String({ description: "Contenuto: l'idea atomica da ricordare" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Etichette per filtro" })),
      tipo: Type.Optional(NoteTypeSchema),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const unavailable = await requireServices({ needsEmbedding: true });
      if (unavailable) return unavailable;

      const input: NoteInput = {
        why: params.why,
        what: params.what,
        tags: params.tags ?? [],
      };

      const when = new Date().toISOString();
      const id = noteId(input.what, when);

      // Correlato casuale seed
      const seedId = await randomNoteId();
      const correlati = seedId
        ? [{ id: seedId, perche: "correlato iniziale — connessione da esplorare" }]
        : [];

      const note: Note = {
        id,
        when,
        why: input.why,
        what: input.what,
        tags: input.tags,
        tipo: (params.tipo ?? "nota") as Note["tipo"],
        stato: "fertile",
        correlati,
      };

      await ensureCollection();
      const vector = await embed(`${note.why}\n\n${note.what}`);
      await upsert(note, vector);

      const seedMsg = seedId
        ? `Correlato seed: ${seedId}`
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
      "Accetta una query in linguaggio naturale, la converte in vettore e trova le note più rilevanti. " +
      "Per default esclude note con stato 'superata' e 'consolidata'.",
    parameters: Type.Object({
      query: Type.String({ description: "Query in linguaggio naturale" }),
      stato: Type.Optional(
        Type.Array(NoteStateSchema, { description: "Filtra per stato. Se omesso: solo note 'fertile'." }),
      ),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Filtra per tag (OR)" })),
      tipo: Type.Optional(
        Type.Array(NoteTypeSchema, { description: "Filtra per tipo semantico (OR)" }),
      ),
      limit: Type.Optional(Type.Number({ description: "Numero massimo di risultati. Default: 10." })),
      depth: Type.Optional(Type.Number({ description: "Profondità traversal correlati. 0 = solo vettoriale. 1 = +correlati diretti (default). 2 = +correlati dei correlati." })),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const unavailable = await requireServices({ needsEmbedding: true });
      if (unavailable) return unavailable;

      const options: SearchOptions = {
        stato: params.stato as SearchOptions["stato"],
        tags: params.tags,
        tipo: params.tipo as SearchOptions["tipo"],
        limit: params.limit,
        depth: params.depth,
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
            `${i + 1}. [${r.via === "search" ? r.score.toFixed(3) : "correlato"}] ${r.note.id} (${r.note.tipo})\n` +
            `   why: ${r.note.why}\n` +
            `   what: ${r.note.what}\n` +
            `   stato: ${r.note.stato} | tags: ${r.note.tags.join(", ") || "—"}`,
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
      "Aggiorna i campi mutabili di una nota esistente: 'stato' e/o 'correlati'. " +
      "I correlati vengono sovrascritti integralmente — passa la lista completa. " +
      "Il contenuto (why, what, tags) è immutabile.",
    parameters: Type.Object({
      id: Type.String({ description: "ID della nota da aggiornare" }),
      stato: Type.Optional(NoteStateSchema),
      correlati: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String({ description: "ID della nota collegata" }),
            perche: Type.String({ description: "Ragione esplicita del collegamento" }),
            relazione: Type.Optional(RelazioneTypeSchema),
          }),
          { description: "Lista completa dei correlati (sovrascrive quella esistente)" },
        ),
      ),
    }),

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const unavailable = await requireServices({ needsEmbedding: false });
      if (unavailable) return unavailable;

      const patch: NoteUpdate = {};
      if (params.stato) patch.stato = params.stato;
      if (params.correlati) patch.correlati = params.correlati;

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
