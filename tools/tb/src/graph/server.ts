import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCollection, scrollAllWithVectors, getByIds } from "../qdrant.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const STATIC_DIR = resolve(__dirname, ".");

export const GRAPH_PORT = 7333;

// ─── PCA ──────────────────────────────────────────────────────────────────────

function pca2d(vectors: number[][]): Array<[number, number]> {
  const n = vectors.length;
  const dim = vectors[0].length;

  const mean = new Array<number>(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i] / n;
  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

  function powerIterate(data: number[][]): number[] {
    let pc = Array.from({ length: dim }, () => Math.random() - 0.5);
    for (let iter = 0; iter < 60; iter++) {
      const proj = data.map((v) => v.reduce((s, x, i) => s + x * pc[i], 0));
      const next = new Array<number>(dim).fill(0);
      for (let j = 0; j < n; j++) for (let i = 0; i < dim; i++) next[i] += data[j][i] * proj[j];
      const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
      pc = next.map((x) => x / norm);
    }
    return pc;
  }

  const pc1 = powerIterate(centered);
  const deflated = centered.map((v) => {
    const p = v.reduce((s, x, i) => s + x * pc1[i], 0);
    return v.map((x, i) => x - p * pc1[i]);
  });
  const pc2 = powerIterate(deflated);

  const coords = centered.map((v): [number, number] => [
    v.reduce((s, x, i) => s + x * pc1[i], 0),
    v.reduce((s, x, i) => s + x * pc2[i], 0),
  ]);

  // normalizza in [-1, 1]
  const maxAbs = Math.max(...coords.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]), 1e-9);
  return coords.map(([x, y]) => [x / maxAbs, y / maxAbs]);
}

// ─── Graph data ───────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  kind: string;
  tags: string[];
  px: number; // posizione PCA normalizzata [-1, 1]
  py: number;
}

interface GraphEdge {
  source: string;
  target: string;
  reason: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

async function buildGraphData(): Promise<GraphData> {
  await ensureCollection();
  const entries = await scrollAllWithVectors();

  const coords = pca2d(entries.map((e) => e.vector));
  const ids = new Set(entries.map((e) => e.note.id));

  const nodes: GraphNode[] = entries.map((e, i) => ({
    id: e.note.id,
    label: e.note.what.slice(0, 80),
    kind: e.note.kind,
    tags: e.note.tags,
    px: coords[i][0],
    py: coords[i][1],
  }));

  const edges: GraphEdge[] = [];
  for (const { note } of entries) {
    for (const ref of note.refs) {
      if (ids.has(ref.id)) {
        edges.push({ source: note.id, target: ref.id, reason: ref.reason });
      }
    }
  }

  return { nodes, edges };
}

// ─── Server ───────────────────────────────────────────────────────────────────

export function serveGraph(): void {
  Bun.serve({
    port: GRAPH_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      const noteMatch = url.pathname.match(/^\/api\/note\/(.+)$/);
      if (noteMatch) {
        const notes = await getByIds([noteMatch[1]]);
        if (notes.length === 0) return new Response("Not found", { status: 404 });
        return new Response(JSON.stringify(notes[0]), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/api/graph") {
        const data = await buildGraphData();
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const filePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = Bun.file(resolve(STATIC_DIR, filePath));
      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(file);
    },
  });
}
