import { embed } from "./infra.js";
import { ensureCollection, upsert, setPayload, getByIds, search, scroll, randomNoteId, noteId } from "./qdrant.js";
import type { ScrollOptions } from "./qdrant.js";
import { REFS_LIMIT } from "./infra.js";
import { noteToText } from "./types.js";
import type { Note, NoteType, Link, SearchOptions, SearchResult } from "./types.js";

// ─── Backref (invariante del grafo) ──────────────────────────────────────────

async function appendBackref(targetId: string, sourceId: string): Promise<void> {
  const found = await getByIds([targetId]);
  if (found.length === 0) return;

  const existing = found[0].backrefs ?? [];
  if (existing.includes(sourceId)) return;

  await setPayload(targetId, { backrefs: [...existing, sourceId] });
}

// ─── API pubblica ─────────────────────────────────────────────────────────────

export interface CreateNoteParams {
  what: string;
  why: string;
  kind?: NoteType;
  tags?: string[];
  source?: string;
}

export async function createNote(params: CreateNoteParams): Promise<{ note: Note; seed: Note | null }> {
  await ensureCollection();

  const when = new Date().toISOString();
  const id = noteId(params.what, when);

  const seedId = await randomNoteId();
  let seed: Note | null = null;
  if (seedId) {
    const found = await getByIds([seedId]);
    if (found.length > 0) seed = found[0];
  }

  const note: Note = {
    id,
    when,
    why: params.why,
    what: params.what,
    tags: params.tags ?? [],
    kind: params.kind ?? "dato",
    ...(params.source && { source: params.source }),
    refs: seed ? [{ id: seed.id, reason: "correlato iniziale — connessione da esplorare" }] : [],
  };

  const vector = await embed(noteToText(note));
  await upsert(note, vector);

  if (seed) {
    await appendBackref(seed.id, id);
  }

  return { note, seed };
}

export async function addRefs(id: string, newRefs: Link[]): Promise<Note> {
  const found = await getByIds([id]);
  if (found.length === 0) throw new Error(`Nota non trovata: ${id}`);

  const current = found[0];
  const merged = [...current.refs, ...newRefs];

  if (merged.length > REFS_LIMIT) {
    throw new Error(
      `Limite refs raggiunto (${merged.length}/${REFS_LIMIT}). ` +
      `Consolida le note correlate in un Hub (kind: "indice") e poi aggiungi l'Hub come ref.`,
    );
  }

  await setPayload(id, { refs: merged });

  for (const ref of newRefs) {
    await appendBackref(ref.id, id);
  }


  return { ...current, refs: merged };
}

export async function changeKind(id: string, kind: NoteType): Promise<void> {
  const found = await getByIds([id]);
  if (found.length === 0) throw new Error(`Nota non trovata: ${id}`);
  await setPayload(id, { kind });
}

export async function searchNotes(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  await ensureCollection();
  const vector = await embed(query);
  return search(vector, { ...options, query_text: query });
}

export async function browseNotes(options: ScrollOptions = {}): Promise<Note[]> {
  await ensureCollection();
  return scroll(options);
}
