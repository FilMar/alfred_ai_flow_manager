const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");
const profileSelect = document.getElementById("profile");
const searchInput = document.getElementById("search");
const card = document.getElementById("card");
const cardClose = document.getElementById("card-close");
const cardKind = document.getElementById("card-kind");
const cardTags = document.getElementById("card-tags");
const cardWhat = document.getElementById("card-what");
const cardWhy  = document.getElementById("card-why");
const cardRefs = document.getElementById("card-refs");

// ─── Costanti ─────────────────────────────────────────────────────────────────

const NODE_RADIUS = 5;
const EXPAND_RADIUS = 80; // raggio di collisione del nodo selezionato (world units)

const KIND_COLOR = {
  dato:           "#4e9af1",
  protocollo:     "#f1c84e",
  sintesi:        "#a78bfa",
  attrito:        "#f87171",
  configurazione: "#34d399",
  indice:         "#fb923c",
};

// ─── Force profiles ───────────────────────────────────────────────────────────
// Modifica questi valori per cambiare il comportamento della simulazione.

const FORCE_PROFILES = {
  // Link: la topologia del grafo guida il layout — i link tirano forte
  link: {
    charge:  -80,
    linkDist: 40,
    linkStr:  0.9,
    collide:  NODE_RADIUS + 2,
    gravity:  0.08,
  },
  // Embed: forze deboli — preserva le posizioni iniziali (semantiche via PCA)
  embed: {
    charge:  -200,
    linkDist: 100,
    linkStr:  0.1,
    collide:  NODE_RADIUS + 6,
    gravity:  0.03,
  },
  // Life: alta repulsione, link deboli — i nodi si muovono come particelle
  life: {
    charge:  -400,
    linkDist: 150,
    linkStr:  0.05,
    collide:  NODE_RADIUS + 12,
    gravity:  0.01,
  },
};

// ─── Depth map ────────────────────────────────────────────────────────────────

const DEPTH_OPACITY = [1, 1, 0.5, 0.25]; // depth 0,1,2,3
const DIM_OPACITY = 0.06;
const MAX_DEPTH = 3;

let depthMap = null; // Map<nodeId, depth> — null = nessuna selezione
let searchQuery = ""; // stringa di ricerca corrente

function nodeMatches(n) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return n.label.toLowerCase().includes(q)
    || n.kind.toLowerCase().includes(q)
    || (n.tags ?? []).some((t) => t.toLowerCase().includes(q));
}

function buildAdjList(edges) {
  const adj = new Map();
  for (const e of edges) {
    const s = e.source.id ?? e.source;
    const t = e.target.id ?? e.target;
    if (!adj.has(s)) adj.set(s, []);
    adj.get(s).push(t); // solo refs in avanti, non backrefs
  }
  return adj;
}

function buildDepthMap(startId, adj) {
  const map = new Map();
  map.set(startId, 0);
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift();
    const d = map.get(id);
    if (d >= MAX_DEPTH) continue;
    for (const nb of (adj.get(id) ?? [])) {
      if (!map.has(nb)) {
        map.set(nb, d + 1);
        queue.push(nb);
      }
    }
  }
  return map;
}

// ─── Simulazione ──────────────────────────────────────────────────────────────

let simulation = null;
let currentBaseCollide = NODE_RADIUS + 2;
let selectedNode = null;

function updateCollide(sim) {
  sim.force("collide", d3.forceCollide((d) =>
    d === selectedNode ? EXPAND_RADIUS : currentBaseCollide
  ));
}

function setForceProfile(sim, nodes, edges, profileName) {
  const p = FORCE_PROFILES[profileName] ?? FORCE_PROFILES.link;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  currentBaseCollide = p.collide;

  sim
    .force("charge", d3.forceManyBody().strength(p.charge))
    .force("link",   d3.forceLink(edges).id((d) => d.id).distance(p.linkDist).strength(p.linkStr))
    .force("x",      d3.forceX(cx).strength(p.gravity))
    .force("y",      d3.forceY(cy).strength(p.gravity));

  updateCollide(sim);
}

// ─── Card ─────────────────────────────────────────────────────────────────────

let nodeIndex = null;
let adjList = null;

function positionCard(node) {
  const sx = transform.x + node.x * transform.k;
  const sy = transform.y + node.y * transform.k;
  const cardW = 480;
  const cardH = card.offsetHeight || 200;
  const left = Math.min(Math.max(sx - cardW / 2, 8), window.innerWidth  - cardW - 8);
  const top  = Math.min(Math.max(sy - cardH / 2, 8), window.innerHeight - cardH - 8);
  card.style.left = left + "px";
  card.style.top  = top  + "px";
  // origin = posizione del nodo relativa alla card, così la scala parte dal nodo
  card.style.transformOrigin = `${sx - left}px ${sy - top}px`;
}

function closeCard() {
  card.classList.remove("open");
  selectedNode = null;
  depthMap = null;
  if (simulation) {
    updateCollide(simulation);
    simulation.alpha(0.4).restart();
  }
}

async function openCard(id) {
  const res = await fetch(`/api/note/${id}`);
  if (!res.ok) return;
  const note = await res.json();

  cardKind.textContent = `${note.kind} · ${note.when.slice(0, 10)}`;
  cardTags.textContent = note.tags.length ? note.tags.map((t) => `#${t}`).join(" ") : "";
  cardWhat.textContent = note.what;
  cardWhy.textContent  = note.why;

  cardRefs.innerHTML = "";
  for (const ref of note.refs ?? []) {
    const label = nodeIndex?.get(ref.id)?.label ?? ref.id.slice(0, 8);
    const a = document.createElement("a");
    a.textContent = `→ ${label}`;
    a.title = ref.reason;
    a.addEventListener("click", () => openCard(ref.id));
    cardRefs.appendChild(a);
  }

  selectedNode = nodeIndex?.get(id) ?? null;
  card.classList.add("open");
  if (selectedNode) positionCard(selectedNode);

  if (simulation) {
    updateCollide(simulation);
    simulation.alpha(0.5).restart();
  }
}

// ─── Pan / Zoom ───────────────────────────────────────────────────────────────

let transform = d3.zoomIdentity;
let hoveredNode = null;

function nodeAtScreen(nodes, sx, sy) {
  const wx = (sx - transform.x) / transform.k;
  const wy = (sy - transform.y) / transform.k;
  const hit = NODE_RADIUS + Math.max(4, 8 / transform.k);
  for (const n of nodes) {
    const dx = n.x - wx, dy = n.y - wy;
    if (dx * dx + dy * dy < hit * hit) return n;
  }
  return null;
}

function initZoom(nodes) {
  const zoom = d3.zoom()
    .scaleExtent([0.1, 8])
    .on("zoom", (event) => {
      transform = event.transform;
    });

  d3.select(canvas)
    .call(zoom)
    .on("mousemove", (event) => {
      const [sx, sy] = d3.pointer(event);
      hoveredNode = nodeAtScreen(nodes, sx, sy);
      depthMap = hoveredNode && adjList ? buildDepthMap(hoveredNode.id, adjList) : null;
      canvas.style.cursor = hoveredNode ? "pointer" : "default";
    })
    .on("mouseleave", () => { hoveredNode = null; depthMap = null; })
    .on("click", (event) => {
      const [sx, sy] = d3.pointer(event);
      const hit = nodeAtScreen(nodes, sx, sy);
      if (hit) openCard(hit.id);
      else closeCard();
    });
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function draw(nodes, edges, t = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.5;
  for (const e of edges) {
    if (e.source.x == null) continue;
    const src = e.source, tgt = e.target;
    const isHovered = hoveredNode && (src === hoveredNode || tgt === hoveredNode);
    if (isHovered) {
      ctx.globalAlpha = 0.7;
    } else if (depthMap) {
      const d = Math.min(depthMap.get(src.id) ?? Infinity, depthMap.get(tgt.id) ?? Infinity);
      ctx.globalAlpha = d <= MAX_DEPTH ? DEPTH_OPACITY[d] * 0.5 : DIM_OPACITY;
    } else {
      ctx.globalAlpha = 0.04;
    }
    ctx.beginPath();
    ctx.moveTo(e.source.x, e.source.y);
    ctx.lineTo(e.target.x, e.target.y);
    ctx.stroke();
  }

  for (const n of nodes) {
    if (n.x == null) continue;
    const d = depthMap?.get(n.id) ?? Infinity;
    const matches = nodeMatches(n);
    if (searchQuery && !matches) {
      ctx.globalAlpha = DIM_OPACITY;
    } else {
      ctx.globalAlpha = 1;
    }
    const r = n === hoveredNode ? NODE_RADIUS + 2 * Math.sin(t / 300) + 2 : NODE_RADIUS;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = KIND_COLOR[n.kind] ?? "#888";
    ctx.fill();

    if (searchQuery && matches) {
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(n.x, n.y, NODE_RADIUS + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  if (selectedNode?.x != null && card.classList.contains("open")) {
    positionCard(selectedNode);
  }
}

// ─── Resize ───────────────────────────────────────────────────────────────────

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (simulation) simulation.restart();
}
window.addEventListener("resize", resize);
resize();

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  status.textContent = "caricamento dati...";
  const res = await fetch("/api/graph");
  const data = await res.json();
  const { nodes, edges } = data;

  status.textContent = `${nodes.length} nodi · ${edges.length} archi`;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const spread = Math.min(canvas.width, canvas.height) * 0.4;
  for (const n of nodes) {
    n.x = cx + n.px * spread;
    n.y = cy + n.py * spread;
  }

  nodeIndex = new Map(nodes.map((n) => [n.id, n]));
  cardClose.addEventListener("click", closeCard);

  initZoom(nodes);

  simulation = d3.forceSimulation(nodes);
  setForceProfile(simulation, nodes, edges, "link");
  // adjList si costruisce dopo setForceProfile perché forceLink risolve source/target da ID a oggetti
  adjList = buildAdjList(edges);

  function loop(t) {
    draw(nodes, edges, t);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  profileSelect.addEventListener("change", () => {
    setForceProfile(simulation, nodes, edges, profileSelect.value);
    simulation.alpha(0.8).restart();
  });

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { searchInput.value = ""; searchQuery = ""; searchInput.blur(); }
  });
}

init();
