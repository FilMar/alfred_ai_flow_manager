import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

const TEST_DB = "/tmp/td-test.db";
process.env.TD_DB_PATH = TEST_DB;

// import dopo aver impostato la variabile — il singleton apre TEST_DB
const { insertTask, insertProject, getTask, getProject, listTasks, moveTask, doneTask, updateTaskData, searchTasks, taskCountByProject } = await import("../tools/td/src/db.ts");

afterAll(() => {
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
});

function makeProject(overrides = {}) {
  return { id: crypto.randomUUID(), name: "test-project", start: "2024-01-01", data: {}, ...overrides };
}

function makeTask(overrides = {}) {
  return { id: crypto.randomUUID(), list: "inbox" as const, created_at: new Date().toISOString(), data: {}, ...overrides };
}

describe("project", () => {
  it("insert e get", () => {
    const p = makeProject();
    insertProject(p);
    expect(getProject(p.id)).toMatchObject({ id: p.id, name: p.name });
  });

  it("get su id inesistente → null", () => {
    expect(getProject("non-esiste")).toBeNull();
  });
});

describe("task", () => {
  it("insert e get", () => {
    const t = makeTask();
    insertTask(t);
    expect(getTask(t.id)).toMatchObject({ id: t.id, list: "inbox" });
  });

  it("get su id inesistente → null", () => {
    expect(getTask("non-esiste")).toBeNull();
  });

  it("moveTask cambia lista", () => {
    const t = makeTask();
    insertTask(t);
    moveTask(t.id, "next");
    expect(getTask(t.id)?.list).toBe("next");
  });

  it("doneTask setta done_at, non cancella il record", () => {
    const t = makeTask();
    insertTask(t);
    doneTask(t.id);
    const result = getTask(t.id);
    expect(result).not.toBeNull();
    expect(result?.done_at).toBeDefined();
  });

  it("listTasks esclude i task completati per default", () => {
    const t = makeTask();
    insertTask(t);
    doneTask(t.id);
    const active = listTasks({ list: t.list });
    expect(active.find((x) => x.id === t.id)).toBeUndefined();
  });

  it("listTasks con includeDone li include", () => {
    const t = makeTask();
    insertTask(t);
    doneTask(t.id);
    const all = listTasks({ includeDone: true });
    expect(all.find((x) => x.id === t.id)).toBeDefined();
  });
});

describe("updateTaskData", () => {
  it("sovrascrive i campi data", () => {
    const t = makeTask({ data: { what: "originale", context: "phone" } });
    insertTask(t);
    updateTaskData(t.id, { what: "modificato", context: "phone" });
    expect((getTask(t.id)?.data as Record<string, unknown>).what).toBe("modificato");
  });

  it("rimuove un campo passando data senza di esso", () => {
    const t = makeTask({ data: { what: "test", due: "2024-12-31" } });
    insertTask(t);
    updateTaskData(t.id, { what: "test" });
    expect((getTask(t.id)?.data as Record<string, unknown>).due).toBeUndefined();
  });
});

describe("searchTasks", () => {
  it("trova task per keyword nel campo what", () => {
    const t = makeTask({ data: { what: "chiamare dentista urgente" } });
    insertTask(t);
    const results = searchTasks("dentista");
    expect(results.find(x => x.id === t.id)).toBeDefined();
  });

  it("non trova task con keyword assente", () => {
    expect(searchTasks("xyznotfound99999")).toHaveLength(0);
  });

  it("esclude completati per default", () => {
    const t = makeTask({ data: { what: "task keyword esclusione" } });
    insertTask(t);
    doneTask(t.id);
    expect(searchTasks("task keyword esclusione").find(x => x.id === t.id)).toBeUndefined();
  });

  it("include completati con includeDone", () => {
    const t = makeTask({ data: { what: "task keyword inclusione" } });
    insertTask(t);
    doneTask(t.id);
    expect(searchTasks("task keyword inclusione", { includeDone: true }).find(x => x.id === t.id)).toBeDefined();
  });
});

describe("taskCountByProject", () => {
  it("conta active e done correttamente", () => {
    const p = makeProject();
    insertProject(p);
    const t1 = makeTask({ project_id: p.id });
    const t2 = makeTask({ project_id: p.id });
    insertTask(t1);
    insertTask(t2);
    doneTask(t2.id);
    expect(taskCountByProject(p.id)).toEqual({ active: 1, done: 1 });
  });
});
