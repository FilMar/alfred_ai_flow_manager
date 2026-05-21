// ─── Costanti enumerabili ─────────────────────────────────────────────────────

export const NOTE_TYPES = [
  "osservazione",
  "congettura",
  "assioma",
  "lemma",
  "tensione",
  "decisione",
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
 * - osservazione: fatto grezzo, empirico, non ancora interpretato
 * - congettura:   pattern sospettato con fondamento, non ancora dimostrato
 * - assioma:      principio assunto vero senza dimostrazione — base del ragionamento
 * - lemma:        risultato intermedio che sostiene qualcos'altro
 * - tensione:     conflitto esplicito tra due idee o assiomi
 * - decisione:    scelta tracciabile con contesto e motivazione
 */

export type RelationType = (typeof RELATION_TYPES)[number];

/** Restituisce true per i tipi citabili e fondati su fonte. */
export function isEvidence(kind: NoteType): boolean {
  return kind === "osservazione" || kind === "lemma";
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
