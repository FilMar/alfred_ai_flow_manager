import { describe, it, expect } from "bun:test";
import { noteId, buildSparseVector } from "../tools/tb/src/qdrant.ts";
import { isEvidence, noteToText } from "../tools/tb/src/types.ts";

describe("noteId", () => {
  it("deterministico: stesso input → stesso output", () => {
    const id1 = noteId("ciao mondo", "2024-01-01T00:00:00Z");
    const id2 = noteId("ciao mondo", "2024-01-01T00:00:00Z");
    expect(id1).toBe(id2);
  });

  it("input diversi → output diversi", () => {
    expect(noteId("a", "b")).not.toBe(noteId("a", "c"));
    expect(noteId("a", "b")).not.toBe(noteId("b", "b"));
  });

  it("formato UUID-shaped: 8-4-4-4-12 hex", () => {
    const parts = noteId("test", "2024-01-01").split("-");
    expect(parts).toHaveLength(5);
    expect(parts[0]).toHaveLength(8);
    expect(parts[1]).toHaveLength(4);
    expect(parts[2]).toHaveLength(4);
    expect(parts[3]).toHaveLength(4);
    expect(parts[4]).toHaveLength(12);
  });
});

describe("buildSparseVector", () => {
  it("testo vuoto → vettore vuoto", () => {
    expect(buildSparseVector("")).toEqual({ indices: [], values: [] });
  });

  it("solo token corti (< 2 chars) → vettore vuoto", () => {
    expect(buildSparseVector("a b c")).toEqual({ indices: [], values: [] });
  });

  it("indices e values hanno la stessa lunghezza", () => {
    const { indices, values } = buildSparseVector("hello world foo bar");
    expect(indices.length).toBe(values.length);
  });

  it("valori sommano a 1.0 (frequenza normalizzata sul totale token)", () => {
    const { values } = buildSparseVector("hello world baz");
    const sum = values.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("token ripetuti: unico token → valore 1.0", () => {
    const { indices, values } = buildSparseVector("hello hello");
    expect(indices).toHaveLength(1);
    expect(values[0]).toBeCloseTo(1.0, 5);
  });

  it("case insensitive: Hello e hello → stesso indice", () => {
    const lower = buildSparseVector("hello hello");
    const mixed = buildSparseVector("Hello hello");
    expect(lower.indices).toEqual(mixed.indices);
    expect(lower.values[0]).toBeCloseTo(mixed.values[0], 5);
  });
});

describe("isEvidence", () => {
  it("'dato' è l'unico tipo evidence", () => {
    expect(isEvidence("dato")).toBe(true);
  });

  it("tutti gli altri tipi non sono evidence", () => {
    for (const kind of ["protocollo", "sintesi", "attrito", "configurazione", "indice"] as const) {
      expect(isEvidence(kind)).toBe(false);
    }
  });
});

describe("noteToText", () => {
  it("combina why e what con doppia newline", () => {
    expect(noteToText({ why: "contesto", what: "idea" })).toBe("contesto\n\nidea");
  });
});
