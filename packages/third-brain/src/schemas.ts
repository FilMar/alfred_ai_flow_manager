/**
 * Schema TypeBox derivati dalle costanti in types.ts.
 * Single source of truth: aggiungere un valore a NOTE_TYPES/RELATION_TYPES
 * aggiorna automaticamente anche questi schema — nessuna duplicazione.
 */

import { Type, type Static } from "typebox";
import { NOTE_TYPES, RELATION_TYPES } from "./types.js";

export const NoteTypeSchema = Type.Union(NOTE_TYPES.map((t) => Type.Literal(t)));
export const RelationTypeSchema = Type.Union(RELATION_TYPES.map((r) => Type.Literal(r)));

export type NoteTypeFromSchema = Static<typeof NoteTypeSchema>;
export type RelationTypeFromSchema = Static<typeof RelationTypeSchema>;
