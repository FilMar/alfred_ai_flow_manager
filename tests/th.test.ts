import { describe, it, expect, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { validateName } from "../tools/th/src/members.ts";

const TEST_TH_DB = "/tmp/th-test.db";
process.env.TH_DB_PATH = TEST_TH_DB;

const { insertRun, finishRun, getRun, listRuns } = await import("../tools/th/src/db.ts");

afterAll(() => {
  for (const f of [TEST_TH_DB, `${TEST_TH_DB}-wal`, `${TEST_TH_DB}-shm`]) {
    try { unlinkSync(f); } catch {}
  }
});

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    member: "test-member",
    task: "test task",
    started_at: new Date().toISOString(),
    status: "running" as const,
    ...overrides,
  };
}

describe("validateName", () => {
  it("accetta lettere, cifre, trattino, underscore", () => {
    expect(() => validateName("mario")).not.toThrow();
    expect(() => validateName("mario-rossi")).not.toThrow();
    expect(() => validateName("mario_rossi")).not.toThrow();
    expect(() => validateName("Mario123")).not.toThrow();
  });

  it("rifiuta stringa vuota", () => {
    expect(() => validateName("")).toThrow();
  });

  it("rifiuta path traversal con slash", () => {
    expect(() => validateName("../etc/passwd")).toThrow();
    expect(() => validateName("a/b")).toThrow();
  });

  it("rifiuta backslash", () => {
    expect(() => validateName("a\\b")).toThrow();
  });

  it("rifiuta spazi", () => {
    expect(() => validateName("mario rossi")).toThrow();
  });

  it("rifiuta caratteri speciali", () => {
    expect(() => validateName("mario@rossi")).toThrow();
    expect(() => validateName("mario.rossi")).toThrow();
    expect(() => validateName("mario!")).toThrow();
  });
});

describe("run history", () => {
  it("insert e get per id completo", () => {
    const r = makeRun();
    insertRun(r);
    expect(getRun(r.id)).toMatchObject({ id: r.id, member: r.member, status: "running" });
  });

  it("get per prefisso id", () => {
    const r = makeRun();
    insertRun(r);
    expect(getRun(r.id.slice(0, 8))).toMatchObject({ id: r.id });
  });

  it("get su id inesistente → null", () => {
    expect(getRun("non-esiste")).toBeNull();
  });

  it("finishRun aggiorna status e finished_at", () => {
    const r = makeRun();
    insertRun(r);
    finishRun(r.id, "done");
    const result = getRun(r.id);
    expect(result?.status).toBe("done");
    expect(result?.finished_at).toBeDefined();
  });

  it("listRuns ordine decrescente per started_at", () => {
    const r1 = makeRun({ started_at: "2024-01-01T00:00:00.000Z" });
    const r2 = makeRun({ started_at: "2024-01-02T00:00:00.000Z" });
    insertRun(r1);
    insertRun(r2);
    const ids = listRuns({ limit: 50 }).map(r => r.id);
    expect(ids.indexOf(r2.id)).toBeLessThan(ids.indexOf(r1.id));
  });

  it("listRuns filtra per membro", () => {
    const r = makeRun({ member: "membro-specifico" });
    insertRun(r);
    const results = listRuns({ member: "membro-specifico" });
    expect(results.every(x => x.member === "membro-specifico")).toBe(true);
  });
});
