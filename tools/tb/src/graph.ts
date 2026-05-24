import { writeFileSync, unlinkSync } from "node:fs";
import { COLLECTION, DENSE_VECTOR_NAME, qdrantClient } from "./infra.js";
import type { Note } from "./types.js";
import { HTML } from "./graph-html.js";

/* Bun runtime globals — not in tsconfig types to keep node-only strict mode */
declare const Bun: {
  serve(opts: {
    port: number;
    fetch(req: Request, server: { upgrade(req: Request): boolean }): Response | undefined | Promise<Response | undefined>;
    websocket: {
      open(ws: { send(d: string): void }): void;
      close(ws: { send(d: string): void }): void;
      message(ws: { send(d: string): void }, msg: string | ArrayBuffer): void;
    };
  }): void;
  spawn(cmd: string[], opts?: { stdio?: unknown[] }): void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const GRAPH_PORT_FILE = "/tmp/tb-graph.port";
const DEFAULT_PORT = 7333;

// ─── Data fetching ────────────────────────────────────────────────────────────

interface NoteWithVector { note: Note; vector: number[] }

async function scrollAllWithVectors(): Promise<NoteWithVector[]> {
  const results: NoteWithVector[] = [];
  let offset: string | null = null;

  type ScrollResp = {
    result: {
      points: Array<{ payload: Note; vector: Record<string, number[]> }>;
      next_page_offset: string | null;
    };
  };

  while (true) {
    const resp: ScrollResp = await qdrantClient.request<ScrollResp>("POST", `/collections/${COLLECTION}/points/scroll`, {
      limit: 100,
      with_payload: true,
      with_vector: [DENSE_VECTOR_NAME],
      ...(offset && { offset }),
    });

    for (const p of resp.result.points) {
      const v = p.vector?.[DENSE_VECTOR_NAME];
      if (v) results.push({ note: p.payload, vector: v });
    }

    if (!resp.result.next_page_offset) break;
    offset = resp.result.next_page_offset;
  }

  return results;
}

// ─── PCA ─────────────────────────────────────────────────────────────────────
// Projects N×D vectors to N×2 using Kernel PCA (power iteration on Gram matrix).
// Works well when N < D (typically true for a personal knowledge base).

function powerIter(K: number[][], iters = 200): { vec: number[]; val: number } {
  const N = K.length;
  let v = Array.from({ length: N }, () => Math.random() - 0.5);
  let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  v = v.map(x => x / norm);
  let val = 1;

  for (let it = 0; it < iters; it++) {
    const Kv = Array<number>(N).fill(0);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        Kv[i] += K[i][j] * v[j];

    val = Math.sqrt(Kv.reduce((s, x) => s + x * x, 0));
    if (val < 1e-12) break;
    const next = Kv.map(x => x / val);
    if (next.reduce((s, x, i) => s + (x - v[i]) ** 2, 0) < 1e-10) { v = next; break; }
    v = next;
  }

  return { vec: v, val };
}

function pca2d(vectors: number[][]): [number, number][] {
  const N = vectors.length;
  if (N <= 2) return vectors.map((_, i) => [i, 0] as [number, number]);
  const D = vectors[0].length;

  const mean = Array<number>(D).fill(0);
  for (const v of vectors) for (let j = 0; j < D; j++) mean[j] += v[j] / N;
  const X = vectors.map(v => v.map((x, j) => x - mean[j]));

  const K = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => {
      let s = 0;
      for (let k = 0; k < D; k++) s += X[i][k] * X[j][k];
      return s;
    })
  );

  const pc1 = powerIter(K);
  const K2 = K.map((row, i) => row.map((x, j) => x - pc1.val * pc1.vec[i] * pc1.vec[j]));
  const pc2 = powerIter(K2);

  const s1 = Math.sqrt(Math.max(pc1.val, 0));
  const s2 = Math.sqrt(Math.max(pc2.val, 0));

  return Array.from({ length: N }, (_, i) => [pc1.vec[i] * s1, pc2.vec[i] * s2]);
}

// ─── Graph data ───────────────────────────────────────────────────────────────

interface GraphNode {
  id: string; x: number; y: number;
  what: string; why: string; kind: string;
  tags: string[]; when: string; source?: string;
  refs: { id: string; reason: string }[];
  size: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: { source: string; target: string; reason: string }[];
}

function buildGraphData(items: NoteWithVector[], coords: [number, number][]): GraphData {
  const nodes: GraphNode[] = items.map(({ note }, i) => ({
    id: note.id, x: coords[i][0], y: coords[i][1],
    what: note.what, why: note.why, kind: note.kind,
    tags: note.tags, when: note.when, source: note.source,
    refs: note.refs,
    size: Math.max(5, 4 + (note.refs.length + (note.backrefs?.length ?? 0)) * 1.5),
  }));

  const nodeIds = new Set(nodes.map(n => n.id));
  const seen = new Set<string>();
  const edges: GraphData["edges"] = [];

  for (const { note } of items) {
    for (const ref of note.refs) {
      if (!nodeIds.has(ref.id)) continue;
      const key = [note.id, ref.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: note.id, target: ref.id, reason: ref.reason });
    }
  }

  return { nodes, edges };
}

// ─── Server ───────────────────────────────────────────────────────────────────

export async function serveGraph(port = DEFAULT_PORT): Promise<void> {
  process.stdout.write(`Raccolta note dal Third Brain...\n`);
  const items = await scrollAllWithVectors();

  if (items.length === 0) {
    throw new Error("Nessuna nota nel Third Brain. Salvane alcune con `tb save`.");
  }

  process.stdout.write(`Proiezione PCA di ${items.length} note...\n`);
  const coords = pca2d(items.map(i => i.vector));
  const graph = buildGraphData(items, coords);
  const graphJson = JSON.stringify(graph);

  const clients = new Set<{ send: (d: string) => void }>();

  writeFileSync(GRAPH_PORT_FILE, String(port));
  process.on("SIGINT", () => { try { unlinkSync(GRAPH_PORT_FILE); } catch {} process.exit(0); });

  Bun.serve({
    port,
    fetch(req, server) {
      const { pathname } = new URL(req.url);

      if (pathname === "/ws") {
        return server.upgrade(req) ? undefined : new Response("WebSocket required", { status: 400 });
      }
      if (pathname === "/api/graph") {
        return new Response(graphJson, { headers: { "Content-Type": "application/json" } });
      }
      if (pathname === "/highlight" && req.method === "POST") {
        (req.json() as Promise<{ ids: string[] }>)
          .then(body => {
            const msg = JSON.stringify({ type: "highlight", ids: body.ids });
            for (const ws of clients) ws.send(msg);
          })
          .catch(() => {});
        return new Response("ok");
      }

      return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    },
    websocket: {
      open(ws) { clients.add(ws); },
      close(ws) { clients.delete(ws); },
      message() {},
    },
  });

  process.stdout.write(`Grafo: http://localhost:${port}\n`);
  // Try to open browser (Linux)
  Bun.spawn(["xdg-open", `http://localhost:${port}`], { stdio: ["ignore", "ignore", "ignore"] });
}
