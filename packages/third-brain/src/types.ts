// ─── Costanti enumerabili ─────────────────────────────────────────────────────
// Single source of truth. I tipi TypeScript e gli schema TypeBox sono derivati
// da questi array — aggiungere un valore qui è sufficiente.

export const NOTE_STATES = ["fertile", "superata", "consolidata"] as const;
export const NOTE_TYPES = ["nota", "credenza", "tensione", "deposito"] as const;
export const RELAZIONE_TYPES = [
  "contraddice",
  "supporta",
  "specializza",
  "genera_tensione",
  "precisa",
  "nega",
] as const;

/** Stati esclusi dalla ricerca per default quando nessun filtro è specificato. */
export const DEFAULT_EXCLUDED_STATES: NoteState[] = ["superata", "consolidata"];

// ─── Tipi derivati ────────────────────────────────────────────────────────────

export type NoteState = (typeof NOTE_STATES)[number];

/**
 * Tipo semantico della nota — immutabile dopo la creazione.
 * - nota:     osservazione o idea generica (default)
 * - credenza: affermazione stabile di Alfred, con confidence e boundary
 * - tensione: conflitto esplicito tra due credenze
 * - deposito: apprendimento post-collaborazione su come ragiona l'utente
 */
export type NoteType = (typeof NOTE_TYPES)[number];

/**
 * Tipo di relazione logica tra note — sostituisce il testo libero per
 * relazioni strutturalmente significative.
 */
export type RelazioneType = (typeof RELAZIONE_TYPES)[number];

// ─── Correlato ───────────────────────────────────────────────────────────────

export interface Correlato {
  /** ID della nota collegata */
  id: string;
  /** Ragione esplicita del collegamento */
  perche: string;
  /**
   * Tipo di relazione logica — opzionale per compatibilità con note esistenti.
   * Quando presente, rende la relazione queryabile strutturalmente.
   */
  relazione?: RelazioneType;
}

// ─── Note ────────────────────────────────────────────────────────────────────

export interface Note {
  /** SHA256(what + when) formattato come UUID — deterministico, immutabile */
  id: string;
  /** ISO 8601 — timestamp di creazione, immutabile */
  when: string;
  /** Contesto: perché questa nota è nata — immutabile */
  why: string;
  /** Contenuto: l'idea atomica — immutabile */
  what: string;
  /** Etichette per filtro — immutabili */
  tags: string[];
  /**
   * Tipo semantico — immutabile dopo la creazione.
   * Default: "nota". Promozione = nuova nota con correlato evolved_from.
   */
  tipo: NoteType;
  /** Ciclo di vita — mutabile */
  stato: NoteState;
  /** Rete di connessioni — mutabile */
  correlati: Correlato[];
}

// ─── Input ───────────────────────────────────────────────────────────────────

/** Campi richiesti per creare una nota. id, when, stato, correlati sono generati automaticamente. */
export type NoteInput = Pick<Note, "why" | "what" | "tags"> & { tipo?: NoteType };

/** Campi modificabili dopo la creazione. */
export interface NoteUpdate {
  stato?: NoteState;
  correlati?: Correlato[];
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Filtra per stato. Default: esclude "superata" e "consolidata". */
  stato?: NoteState[];
  /** Filtra per tag (OR). */
  tags?: string[];
  /** Filtra per tipo semantico (OR). */
  tipo?: NoteType[];
  /** Numero massimo di risultati dal vettore. Default: 10. */
  limit?: number;
  /**
   * Profondità di traversal dei correlati.
   * 0 = solo ricerca vettoriale.
   * 1 = vettoriale + 1 hop di correlati (default).
   * 2 = vettoriale + correlati + correlati dei correlati.
   */
  depth?: number;
}

export type SearchResult =
  | { note: Note; score: number; via: "search" }
  | { note: Note; score: null; via: "correlato" };
