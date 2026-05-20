import { createHash } from "node:crypto";
import { COLLECTION, VECTOR_SIZE } from "./config.js";
import { qdrantClient } from "./clients.js";
import { HttpError } from "./http-client.js";
import type { Note, NoteUpdate, SearchOptions, SearchResult } from "./types.js";
import { DEFAULT_EXCLUDED_STATES } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Genera un UUID deterministico da SHA256(what + when). */
export function noteId(what: string, when: string): string {
  const hash = createHash("sha256").update(`${what}:${when}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

// ─── Setup ───────────────────────────────────────────────────────────────────

/**
 * Crea la collezione se non esiste e configura gli indici keyword
 * su `stato`, `tags`, `tipo` per filtri O(1).
 */
export async function ensureCollection(): Promise<void> {
  const check = await qdrantClient.fetch("GET", `/collections/${COLLECTION}`);
  if (check.ok) return;

  const create = await qdrantClient.fetch("PUT", `/collections/${COLLECTION}`, {
    vectors: { size: VECTOR_SIZE, distance: "Cosine" },
  });
  // 409 = collezione già esistente (race condition su save paralleli) — non è un errore
  if (!create.ok && create.status !== 409) {
    const text = await create.text();
    throw new Error(`Qdrant: impossibile creare la collezione — ${create.status} ${text}`);
  }
  if (create.status === 409) return;

  // Indici keyword per filtri rapidi
  for (const field of ["stato", "tags", "tipo"]) {
    await qdrantClient.request("PUT", `/collections/${COLLECTION}/index`, {
      field_name: field,
      field_schema: "keyword",
    });
  }
}

// ─── Operazioni ──────────────────────────────────────────────────────────────

/** Salva (o sovrascrive) una nota con il suo vettore. */
export async function upsert(note: Note, vector: number[]): Promise<void> {
  await qdrantClient.request("PUT", `/collections/${COLLECTION}/points?wait=true`, {
    points: [{ id: note.id, vector, payload: note }],
  });
}

/**
 * Recupera note per ID. Usato per il traversal dei correlati.
 * - 404: ritorna [] (gli ID potrebbero non esistere ancora)
 * - altri errori: propaga — non nascondere guasti del servizio
 */
export async function getByIds(ids: string[]): Promise<Note[]> {
  if (ids.length === 0) return [];

  let data: { result: Array<{ payload: Note }> };
  try {
    data = await qdrantClient.request<{ result: Array<{ payload: Note }> }>(
      "POST",
      `/collections/${COLLECTION}/points`,
      { ids, with_payload: true, with_vector: false },
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return [];
    throw err;
  }

  return data.result.map((r) => r.payload).filter(Boolean);
}

// ─── Filter builder ───────────────────────────────────────────────────────────

/**
 * Costruisce il filtro Qdrant da SearchOptions.
 * Estratto per testabilità e per evitare la logica if/push ripetuta.
 */
function buildSearchFilter(options: SearchOptions): Record<string, unknown> | undefined {
  const must: unknown[] = [];
  const must_not: unknown[] = [];

  // Stato: se non specificato esclude per default superata/consolidata
  if (options.stato?.length) {
    must.push({ key: "stato", match: { any: options.stato } });
  } else {
    must_not.push({ key: "stato", match: { any: DEFAULT_EXCLUDED_STATES } });
  }

  if (options.tags?.length) {
    must.push({ key: "tags", match: { any: options.tags } });
  }

  if (options.tipo?.length) {
    must.push({ key: "tipo", match: { any: options.tipo } });
  }

  if (must.length === 0 && must_not.length === 0) return undefined;
  return {
    ...(must.length > 0 && { must }),
    ...(must_not.length > 0 && { must_not }),
  };
}

// ─── Traversal ────────────────────────────────────────────────────────────────

/** Massimo numero di nodi visitati in un singolo traversal BFS. Protegge da grafi densi. */
const MAX_CORRELATES_VISITED = 500;
/** Massimo numero di ID per singola chiamata getByIds(). */
const MAX_IDS_PER_BATCH = 200;

/**
 * BFS sui correlati di un insieme iniziale di note.
 * Ritorna solo i nodi nuovi (non inclusi in `seen`), marcati via "correlato".
 */
async function traverseCorrelates(
  initial: Note[],
  seen: Set<string>,
  depth: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  let frontier = initial;

  for (let hop = 0; hop < depth; hop++) {
    if (seen.size >= MAX_CORRELATES_VISITED) break;

    let ids = [
      ...new Set(
        frontier.flatMap((n) => n.correlati.map((c) => c.id)).filter((id) => !seen.has(id)),
      ),
    ];

    if (ids.length === 0) break;

    // Batch se troppi ID — protegge da richieste POST massicce
    if (ids.length > MAX_IDS_PER_BATCH) {
      ids = ids.slice(0, MAX_IDS_PER_BATCH);
    }

    const linked = await getByIds(ids);
    frontier = [];

    for (const note of linked) {
      if (!seen.has(note.id) && seen.size < MAX_CORRELATES_VISITED) {
        seen.add(note.id);
        results.push({ note, score: null, via: "correlato" });
        frontier.push(note);
      }
    }
  }

  return results;
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Ricerca semantica con traversal dei correlati.
 *
 * Passo 1 — ricerca vettoriale: note semanticamente vicine alla query.
 * Passo 2 — traversal correlati: espande i risultati via BFS fino a `depth` hop.
 *
 * Di default esclude note "superata" e "consolidata".
 */
export async function search(vector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
  const filter = buildSearchFilter(options);

  const data = await qdrantClient.request<{ result: Array<{ payload: Note; score: number }> }>(
    "POST",
    `/collections/${COLLECTION}/points/search`,
    {
      vector,
      limit: options.limit ?? 10,
      with_payload: true,
      ...(filter && { filter }),
    },
  );

  const results: SearchResult[] = data.result.map((r) => ({
    note: r.payload,
    score: r.score,
    via: "search" as const,
  }));

  const depth = options.depth ?? 1;
  if (depth > 0 && results.length > 0) {
    const seen = new Set(results.map((r) => r.note.id));
    const correlates = await traverseCorrelates(
      results.map((r) => r.note),
      seen,
      depth,
    );
    results.push(...correlates);
  }

  return results;
}

// ─── Update ──────────────────────────────────────────────────────────────────

/** Aggiorna `stato` e/o `correlati` di una nota esistente. */
export async function updateNote(id: string, patch: NoteUpdate): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.stato !== undefined) payload["stato"] = patch.stato;
  if (patch.correlati !== undefined) payload["correlati"] = patch.correlati;

  if (Object.keys(payload).length === 0) return;

  await qdrantClient.request("POST", `/collections/${COLLECTION}/points/payload?wait=true`, {
    payload,
    points: [id],
  });
}

// ─── Util ─────────────────────────────────────────────────────────────────────

/**
 * Restituisce l'ID di una nota casuale dalla collezione.
 * Usato per generare il correlato seed alla creazione.
 * Ritorna null se la collezione è vuota o non raggiungibile.
 */
export async function randomNoteId(): Promise<string | null> {
  let data: { result?: { points?: { id: string }[] } };
  try {
    data = await qdrantClient.request<{ result?: { points?: { id: string }[] } }>(
      "POST",
      `/collections/${COLLECTION}/points/scroll`,
      { limit: 100, with_payload: false, with_vector: false },
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw new Error(`randomNoteId: Qdrant unreachable — ${err instanceof Error ? err.message : String(err)}`);
  }

  const points = data.result?.points ?? [];
  if (points.length === 0) return null;
  return points[Math.floor(Math.random() * points.length)].id;
}
