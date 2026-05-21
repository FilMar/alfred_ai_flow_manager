import { createHash } from "node:crypto";
import { COLLECTION, DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME, VECTOR_SIZE } from "./config.js";
import { qdrantClient } from "./clients.js";
import { HttpError } from "./http-client.js";
import type { Note, NoteUpdate, SearchOptions, SearchResult, Citation } from "./types.js";
import { NOTE_TYPES, isEvidence, noteToText } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Genera un UUID-shaped ID deterministico da SHA256(what + ":" + when). Usa i primi 128 bit. */
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

/**
 * Genera un vettore sparse BM25-style dal testo.
 * Qdrant applica IDF lato server (modifier: "idf").
 * Nessun modello esterno richiesto — tokenizzazione locale.
 */
export function buildSparseVector(text: string): { indices: number[]; values: number[] } {
  const tokens = text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return { indices: [], values: [] };

  // Calcola TF per ogni token
  const freq = new Map<number, number>();
  for (const token of tokens) {
    const idx = hashToken(token);
    freq.set(idx, (freq.get(idx) ?? 0) + 1);
  }

  const total = tokens.length;
  const indices: number[] = [];
  const values: number[] = [];
  for (const [idx, count] of freq.entries()) {
    indices.push(idx);
    values.push(count / total); // TF normalizzato
  }

  return { indices, values };
}

/** Hash djb2 mappato a [0, VOCAB_SIZE). Collision-tolerant per uso personale. */
function hashToken(token: string, vocabSize = 32768): number {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) & 0x7fffffff;
  }
  return hash % vocabSize;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

/**
 * Crea la collezione se non esiste e configura gli indici keyword
 * su `tags`, `kind` per filtri O(1).
 */
export async function ensureCollection(): Promise<void> {
  const check = await qdrantClient.fetch("GET", `/collections/${COLLECTION}`);

  if (check.ok) {
    const info = await check.json() as {
      result?: {
        config?: { params?: { sparse_vectors?: unknown } };
        payload_schema?: Record<string, unknown>;
      };
    };

    if (info.result?.config?.params?.sparse_vectors === undefined) {
      // Schema vecchio — elimina e ricrea
      try {
        await qdrantClient.request("DELETE", `/collections/${COLLECTION}`, undefined);
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 404)) throw err;
      }
      // continua sotto alla creazione
    } else {
      // Schema corretto — verifica che gli indici esistano
      const schema = info.result?.payload_schema ?? {};
      const missingKeyword = ["tags", "kind"].filter((f) => !(f in schema));
      const missingText = ["what", "why"].filter((f) => !(f in schema));

      for (const field of missingKeyword) {
        await qdrantClient.request("PUT", `/collections/${COLLECTION}/index`, {
          field_name: field,
          field_schema: "keyword",
        });
      }
      for (const field of missingText) {
        await qdrantClient.request("PUT", `/collections/${COLLECTION}/index`, {
          field_name: field,
          field_schema: { type: "text", tokenizer: "word", lowercase: true },
        });
      }
      return;
    }
  } else if (check.status !== 404) {
    const text = await check.text();
    throw new Error(`Qdrant: errore su GET collection — ${check.status} ${text}`);
  }

  // Crea collection con dense (named) + sparse (IDF)
  const create = await qdrantClient.fetch("PUT", `/collections/${COLLECTION}`, {
    vectors: {
      [DENSE_VECTOR_NAME]: { size: VECTOR_SIZE, distance: "Cosine" },
    },
    sparse_vectors: {
      [SPARSE_VECTOR_NAME]: { modifier: "idf" },
    },
  });

  if (!create.ok && create.status !== 409) {
    const text = await create.text();
    throw new Error(`Qdrant: impossibile creare la collezione — ${create.status} ${text}`);
  }

  // Indici keyword per filtri O(1)
  for (const field of ["tags", "kind"]) {
    await qdrantClient.request("PUT", `/collections/${COLLECTION}/index`, {
      field_name: field,
      field_schema: "keyword",
    });
  }

  // Text index su `what` e `why` per full-text search
  for (const field of ["what", "why"]) {
    await qdrantClient.request("PUT", `/collections/${COLLECTION}/index`, {
      field_name: field,
      field_schema: { type: "text", tokenizer: "word", lowercase: true },
    });
  }
}

// ─── Operazioni ──────────────────────────────────────────────────────────────

/** Salva (o sovrascrive) una nota con il suo vettore. */
export async function upsert(note: Note, vector: number[]): Promise<void> {
  const sparse = buildSparseVector(noteToText(note));
  await qdrantClient.request("PUT", `/collections/${COLLECTION}/points?wait=true`, {
    points: [
      {
        id: note.id,
        vector: {
          [DENSE_VECTOR_NAME]: vector,
          [SPARSE_VECTOR_NAME]: sparse,
        },
        payload: note,
      },
    ],
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

  if (options.tags?.length) {
    must.push({ key: "tags", match: { any: options.tags } });
  }

  if (options.evidence_only) {
    must.push({ key: "kind", match: { any: NOTE_TYPES.filter(isEvidence) } });
  } else if (options.kind?.length) {
    must.push({ key: "kind", match: { any: options.kind } });
  }

  if (must.length === 0) return undefined;
  return { must };
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
        frontier.flatMap((n) => n.refs.map((c) => c.id)).filter((id) => !seen.has(id)),
      ),
    ];

    if (ids.length === 0) break;

    // Batch se troppi ID — protegge da richieste POST massicce
    const linked: Note[] = [];
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_BATCH) {
      const batch = ids.slice(i, i + MAX_IDS_PER_BATCH);
      const batchResult = await getByIds(batch);
      linked.push(...batchResult);
    }
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
type QdrantQueryResponse = { result: { points: Array<{ payload: Note; score: number }> } };

export async function search(vector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
  const filter = buildSearchFilter(options);

  let data: QdrantQueryResponse;

  if (options.hybrid && options.query_text) {
    // Hybrid: dense + sparse con RRF fusion via Query API
    const sparse = buildSparseVector(options.query_text);
    const prefetchLimit = Math.max((options.limit ?? 10) * 3, 20);

    data = await qdrantClient.request<QdrantQueryResponse>(
      "POST",
      `/collections/${COLLECTION}/points/query`,
      {
        prefetch: [
          {
            query: vector,
            using: DENSE_VECTOR_NAME,
            limit: prefetchLimit,
            ...(filter && { filter }),
          },
          {
            query: sparse,
            using: SPARSE_VECTOR_NAME,
            limit: prefetchLimit,
            ...(filter && { filter }),
          },
        ],
        query: { fusion: "rrf" },
        limit: options.limit ?? 10,
        with_payload: true,
        ...(filter && { filter }),
      },
    );
  } else {
    // Dense-only via Query API (stessa API, senza prefetch)
    data = await qdrantClient.request<QdrantQueryResponse>(
      "POST",
      `/collections/${COLLECTION}/points/query`,
      {
        query: vector,
        using: DENSE_VECTOR_NAME,
        limit: options.limit ?? 10,
        with_payload: true,
        ...(filter && { filter }),
      },
    );
  }

  const results: SearchResult[] = data.result.points.map((r) => ({
    note: r.payload,
    score: r.score,
    via: "search" as const,
    citation: {
      note_id: r.payload.id,
      snippet: r.payload.what.slice(0, 200),
      score: r.score,
      source: r.payload.source,
      timestamp: r.payload.when,
    },
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

/** Aggiorna `kind` e/o `refs` di una nota esistente. */
export async function updateNote(id: string, patch: NoteUpdate): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.kind !== undefined) payload["kind"] = patch.kind;
  if (patch.refs !== undefined) payload["refs"] = patch.refs;

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
  // Prima recupera il conteggio totale
  let info: { result?: { points_count?: number } };
  try {
    info = await qdrantClient.request<{ result?: { points_count?: number } }>(
      "GET",
      `/collections/${COLLECTION}`,
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw new Error(`randomNoteId: Qdrant unreachable — ${err instanceof Error ? err.message : String(err)}`);
  }

  const count = info.result?.points_count ?? 0;
  if (count === 0) return null;

  // Offset casuale su tutta la collezione
  const offset = Math.floor(Math.random() * count);

  let data: { result?: { points?: { id: string }[] } };
  try {
    data = await qdrantClient.request<{ result?: { points?: { id: string }[] } }>(
      "POST",
      `/collections/${COLLECTION}/points/scroll`,
      { limit: 1, offset, with_payload: false, with_vector: false },
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw new Error(`randomNoteId: Qdrant unreachable — ${err instanceof Error ? err.message : String(err)}`);
  }

  const points = data.result?.points ?? [];
  if (points.length === 0) return null;
  return points[0].id;
}
