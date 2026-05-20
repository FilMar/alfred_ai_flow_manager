/**
 * Schema TypeBox derivati dalle costanti in types.ts.
 * Single source of truth: aggiungere un valore a NOTE_TYPES/RELAZIONE_TYPES/NOTE_STATES
 * aggiorna automaticamente anche questi schema — nessuna duplicazione.
 */

import { Type } from "typebox";
import { NOTE_STATES, NOTE_TYPES, RELAZIONE_TYPES } from "./types.js";

export const NoteStateSchema = Type.Union(NOTE_STATES.map((s) => Type.Literal(s)));
export const NoteTypeSchema = Type.Union(NOTE_TYPES.map((t) => Type.Literal(t)));
export const RelazioneTypeSchema = Type.Union(RELAZIONE_TYPES.map((r) => Type.Literal(r)));
