// ─── Costanti enumerabili ─────────────────────────────────────────────────────

export const NOTE_TYPES = [
  "dato",
  "protocollo",
  "sintesi",
  "attrito",
  "configurazione",
  "indice",
] as const;

export const RELATION_TYPES = [
  "supporta",
  "contraddice",
  "nega",
  "specializza",
  "affina",
  "crea_tensione",
] as const;

// ─── Tipi derivati ────────────────────────────────────────────────────────────

export type NoteType = (typeof NOTE_TYPES)[number];

/**
 * Tipo semantico della nota — immutabile dopo la creazione.
 * - dato: fatto grezzo, costante, parametro tecnico
 * - protocollo: istruzioni, routine, procedure "se A allora B"
 * - sintesi: ponti creativi, intuizioni, conclusioni non ovvie
 * - attrito: bug, errori, tensioni, resistenze
 * - configurazione: decisioni prese, setup, preferenze
 * - indice: note madri che condensano cluster densi
 */

export type RelationType = (typeof RELATION_TYPES)[number];

/** Restituisce true per i tipi citabili e fondati su fonte. */
export function isEvidence(kind: NoteType): boolean {
  return kind === "dato";
}

/** Testo canonico da vettorizzare per una nota: contesto + contenuto. */
export function noteToText(note: Pick<Note, "why" | "what">): string {
  return `${note.why}\n\n${note.what}`;
}

// ─── Link ─────────────────────────────────────────────────────────────────────

export interface Link {
  /** ID della nota collegata */
  id: string;
  /** Ragione esplicita del collegamento */
  reason: string;
  /** Tipo di relazione logica — opzionale per compatibilità con note esistenti. */
  relation?: RelationType;
}

// ─── Note ────────────────────────────────────────────────────────────────────

export interface Note {
  /** SHA256(what + ":" + when) formattato come UUID — deterministico, immutabile */
  id: string;
  /** ISO 8601 — timestamp di creazione, immutabile */
  when: string;
  /** Contesto: perché questa nota è nata — immutabile */
  why: string;
  /** Contenuto: l'idea atomica — immutabile */
  what: string;
  /** Etichette per filtro — immutabili */
  tags: string[];
  /** Tipo semantico — immutabile dopo la creazione. */
  kind: NoteType;
  /** URI della fonte originale — opzionale */
  source?: string;
  /** Rete di connessioni — mutabile */
  refs: Link[];
}

// ─── Input ───────────────────────────────────────────────────────────────────

export type NoteInput = Pick<Note, "why" | "what" | "tags"> & { kind?: NoteType };

export interface NoteUpdate {
  kind?: NoteType;
  refs?: Link[];
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Filtra per tag (OR). */
  tags?: string[];
  /** Filtra per tipo semantico (OR). */
  kind?: NoteType[];
  /** Numero massimo di risultati dal vettore. Default: 10. */
  limit?: number;
  /**
   * Profondità di traversal dei refs.
   * 0 = solo ricerca vettoriale.
   * 1 = vettoriale + 1 hop di refs (default).
   * 2 = vettoriale + refs + refs dei refs.
   */
  depth?: number;
  /** Se true, restringe la ricerca ai soli tipi evidence-oriented (osservazione, lemma). */
  evidence_only?: boolean;
  /** Se true, usa hybrid retrieval (dense + sparse + RRF fusion via Query API). Default: false. */
  hybrid?: boolean;
  /** Testo della query originale. Richiesto se hybrid=true. */
  query_text?: string;
}

export interface Citation {
  note_id: string;
  snippet: string;
  score: number;
  source?: string;
  timestamp: string;
}

export type SearchResult =
  | { note: Note; score: number; via: "search"; citation?: Citation }
  | { note: Note; score: null; via: "correlato" };
