import { createHash } from "node:crypto";
import { COLLECTION, DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME, VECTOR_SIZE, SNIPPET_MAX_LEN, qdrantClient, HttpError } from "./infra.js";
import type { Note, NoteType, SearchOptions, SearchResult } from "./types.js";
import { NOTE_TYPES, isEvidence, noteToText } from "./types.js";

// ─── ID / Vettori ─────────────────────────────────────────────────────────────

/** Genera un UUID-shaped ID deterministico da SHA256(what + ":" + when). */
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

export function buildSparseVector(text: string): { indices: number[]; values: number[] } {
  const tokens = text.toLowerCase().split(/\W+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return { indices: [], values: [] };

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
    values.push(count / total);
  }
  return { indices, values };
}

const SPARSE_VOCAB_SIZE = 32768;

function hashToken(token: string, vocabSize = SPARSE_VOCAB_SIZE): number {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) & 0x7fffffff;
  }
  return hash % vocabSize;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

async function createIndices(only?: string[]): Promise<void> {
  const keyword = ["tags", "kind"].filter((f) => !only || only.includes(f));
  const text = ["what", "why"].filter((f) => !only || only.includes(f));
  for (const field of keyword) {
    await qdrantClient.request("PUT", `/collections/${COLLECTION}/index`, {
      field_name: field,
      field_schema: "keyword",
    });
  }
  for (const field of text) {
    await qdrantClient.request("PUT", `/collections/${COLLECTION}/index`, {
      field_name: field,
      field_schema: { type: "text", tokenizer: "word", lowercase: true },
    });
  }
}

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
      try {
        await qdrantClient.request("DELETE", `/collections/${COLLECTION}`, undefined);
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 404)) throw err;
      }
    } else {
      const schema = info.result?.payload_schema ?? {};
      const missing = ["tags", "kind", "what", "why"].filter((f) => !(f in schema));
      if (missing.length > 0) await createIndices(missing);
      return;
    }
  } else if (check.status !== 404) {
    const text = await check.text();
    throw new Error(`Qdrant: errore su GET collection — ${check.status} ${text}`);
  }

  const create = await qdrantClient.fetch("PUT", `/collections/${COLLECTION}`, {
    vectors: { [DENSE_VECTOR_NAME]: { size: VECTOR_SIZE, distance: "Cosine" } },
    sparse_vectors: { [SPARSE_VECTOR_NAME]: { modifier: "idf" } },
  });

  if (!create.ok && create.status !== 409) {
    const text = await create.text();
    throw new Error(`Qdrant: impossibile creare la collezione — ${create.status} ${text}`);
  }

  await createIndices();
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/** Salva (o sovrascrive) una nota con il suo vettore. Nessuna business logic. */
export async function upsert(note: Note, vector: number[]): Promise<void> {
  const sparse = buildSparseVector(noteToText(note));
  await qdrantClient.request("PUT", `/collections/${COLLECTION}/points?wait=true`, {
    points: [
      {
        id: note.id,
        vector: { [DENSE_VECTOR_NAME]: vector, [SPARSE_VECTOR_NAME]: sparse },
        payload: note,
      },
    ],
  });
}

/** Aggiorna campi specifici del payload di una nota. */
export async function setPayload(id: string, payload: Record<string, unknown>): Promise<void> {
  await qdrantClient.request("POST", `/collections/${COLLECTION}/points/payload?wait=true`, {
    payload,
    points: [id],
  });
}

/** Recupera note per ID. Ritorna [] su 404. */
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

/** Restituisce l'ID di una nota casuale usando un vettore random normalizzato. O(log n), no Ollama. */
export async function randomNoteId(): Promise<string | null> {
  const v = Array.from({ length: VECTOR_SIZE }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  const vector = v.map((x) => x / norm);

  type QueryResp = { result?: { points?: Array<{ id: string }> } };
  let data: QueryResp;
  try {
    data = await qdrantClient.request<QueryResp>(
      "POST",
      `/collections/${COLLECTION}/points/query`,
      { query: vector, using: DENSE_VECTOR_NAME, limit: 1, with_payload: false },
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw new Error(`randomNoteId: ${err instanceof Error ? err.message : String(err)}`);
  }

  const points = data.result?.points ?? [];
  return points.length > 0 ? points[0].id : null;
}

// ─── Filter ───────────────────────────────────────────────────────────────────

function buildSearchFilter(options: SearchOptions): Record<string, unknown> | undefined {
  const must: unknown[] = [];
  const must_not: unknown[] = [];

  if (options.tags?.length) {
    must.push({ key: "tags", match: { any: options.tags } });
  }

  if (options.evidence_only) {
    must.push({ key: "kind", match: { any: NOTE_TYPES.filter(isEvidence) } });
  } else if (options.kind?.length) {
    must.push({ key: "kind", match: { any: options.kind } });
  }

  if (!options.include_hubs) {
    must_not.push({ key: "kind", match: { value: "indice" } });
  }

  if (must.length === 0 && must_not.length === 0) return undefined;
  const filter: Record<string, unknown> = {};
  if (must.length > 0) filter.must = must;
  if (must_not.length > 0) filter.must_not = must_not;
  return filter;
}

// ─── Traversal ────────────────────────────────────────────────────────────────

const MAX_CORRELATES_VISITED = 500;
const MAX_IDS_PER_BATCH = 200;

async function traverseCorrelates(
  initial: Note[],
  seen: Set<string>,
  depth: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  let frontier = initial;

  for (let hop = 0; hop < depth; hop++) {
    if (seen.size >= MAX_CORRELATES_VISITED) break;

    const ids = [
      ...new Set(
        frontier.flatMap((n) => n.refs.map((c) => c.id)).filter((id) => !seen.has(id)),
      ),
    ];
    if (ids.length === 0) break;

    const linked: Note[] = [];
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_BATCH) {
      linked.push(...await getByIds(ids.slice(i, i + MAX_IDS_PER_BATCH)));
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

type QdrantQueryResponse = { result: { points: Array<{ payload: Note; score: number }> } };

export async function search(vector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
  const filter = buildSearchFilter(options);

  let data: QdrantQueryResponse;

  if (options.hybrid && options.query_text) {
    const sparse = buildSparseVector(options.query_text);
    const prefetchLimit = Math.max((options.limit ?? 10) * 3, 20);

    data = await qdrantClient.request<QdrantQueryResponse>(
      "POST",
      `/collections/${COLLECTION}/points/query`,
      {
        prefetch: [
          { query: vector, using: DENSE_VECTOR_NAME, limit: prefetchLimit, ...(filter && { filter }) },
          { query: sparse, using: SPARSE_VECTOR_NAME, limit: prefetchLimit, ...(filter && { filter }) },
        ],
        query: { fusion: "rrf" },
        limit: options.limit ?? 10,
        with_payload: true,
        ...(filter && { filter }),
      },
    );
  } else {
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
      snippet: r.payload.what.slice(0, SNIPPET_MAX_LEN),
      score: r.score,
      source: r.payload.source,
      timestamp: r.payload.when,
    },
  }));

  const depth = options.depth ?? 1;
  if (depth > 0 && results.length > 0) {
    const seen = new Set(results.map((r) => r.note.id));
    results.push(...await traverseCorrelates(results.map((r) => r.note), seen, depth));
  }

  return results;
}

// ─── Facets ──────────────────────────────────────────────────────────────────

export interface TagFacet {
  value: string;
  count: number;
}

export async function listTags(limit = 200): Promise<TagFacet[]> {
  const data = await qdrantClient.request<{ result: { hits: TagFacet[] } }>(
    "POST",
    `/collections/${COLLECTION}/facets`,
    { key: "tags", limit },
  );
  return data.result.hits;
}

// ─── Scroll ──────────────────────────────────────────────────────────────────

export interface ScrollOptions {
  kind?: NoteType;
  since?: string;
  limit?: number;
}

export async function scroll(options: ScrollOptions = {}): Promise<Note[]> {
  const must: unknown[] = [];
  if (options.kind) must.push({ key: "kind", match: { value: options.kind } });
  if (options.since) must.push({ key: "when", range: { gte: options.since } });

  const body: Record<string, unknown> = {
    limit: options.limit ?? 20,
    with_payload: true,
    with_vector: false,
  };
  if (must.length > 0) body.filter = { must };

  const data = await qdrantClient.request<{ result: { points: Array<{ payload: Note }> } }>(
    "POST",
    `/collections/${COLLECTION}/points/scroll`,
    body,
  );

  return data.result.points.map((p) => p.payload);
}
