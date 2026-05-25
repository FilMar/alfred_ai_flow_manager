/* eslint-disable */
// Serve HTML template for `tb graph` — embedded D3 visualization.
export const HTML = /* html */`<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Third Brain</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #08080f; color: #ccc; font-family: 'SF Mono','Fira Code','Cascadia Code',monospace; overflow: hidden; }
#canvas { display: block; }
.edge { stroke: rgba(255,255,255,0.07); stroke-width: 1; fill: none; }
.edge-lit { stroke: rgba(255,200,60,0.6); stroke-width: 2; }
.edge-hover { stroke: rgba(255,200,60,0.45); stroke-width: 1.5; }
.node { cursor: pointer; stroke: rgba(255,255,255,0.12); stroke-width: 1; }
.node-lit { filter: url(#glow); stroke: rgba(255,255,255,0.7); stroke-width: 1.5; }
.label { font-size: 9px; fill: rgba(255,255,255,0.4); pointer-events: none; user-select: none; }
#htag {
  position: fixed; font-size: 10px; color: #999;
  background: rgba(8,8,15,0.88); border-radius: 4px;
  padding: 3px 8px; pointer-events: none; display: none; z-index: 10;
  letter-spacing: 0.04em;
}
#hud { position: fixed; top: 16px; left: 16px; font-size: 11px; color: #3a3a55; line-height: 2; }
#sb {
  position: fixed; top: 13px; left: 50%; transform: translateX(-50%);
  background: #11111d; border: 1px solid #252535; border-radius: 20px;
  padding: 6px 18px; font-size: 12px; color: #ccc; width: 280px;
  outline: none; font-family: inherit;
}
#sb:focus { border-color: #44445a; }
#sb::placeholder { color: #3a3a55; }
#legend {
  position: fixed; bottom: 18px; right: 18px;
  background: rgba(8,8,15,0.9); border: 1px solid #1c1c2c;
  border-radius: 10px; padding: 10px 14px;
}
.li { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 11px; color: #777; }
.dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
#modeBtn {
  position: fixed; top: 13px; right: 18px;
  background: #11111d; border: 1px solid #252535; border-radius: 20px;
  padding: 6px 16px; font-size: 11px; color: #3a3a55; cursor: pointer;
  font-family: inherit; letter-spacing: 0.08em; outline: none;
}
#modeBtn:hover { border-color: #44445a; color: #888; }
#modeBtn.vec { border-color: #4e79a7; color: #4e79a7; }
</style>
</head>
<body>
<svg id="canvas"></svg>
<div id="htag"></div>
<div id="hud"></div>
<input id="sb" placeholder="filtra nodi…" autocomplete="off" spellcheck="false">
<div id="legend"></div>
<button id="modeBtn">vettori</button>

<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
const C = { dato:'#4e79a7', protocollo:'#59a14f', sintesi:'#f28e2b', attrito:'#e15759', configurazione:'#76b7b2', indice:'#b07aa1' };
const L = { dato:'Dato', protocollo:'Protocollo', sintesi:'Sintesi', attrito:'Attrito', configurazione:'Configurazione', indice:'Indice' };


(async () => {
  const data = await d3.json('/api/graph');
  if (!data?.nodes?.length) { document.getElementById('hud').textContent = 'Nessuna nota.'; return; }

  const W = window.innerWidth, H = window.innerHeight;

  // Scale PCA coords to screen space — saved as target positions for the anchor force
  const ix = d3.scaleLinear().domain(d3.extent(data.nodes, d => d.x)).range([W*0.12, W*0.88]);
  const iy = d3.scaleLinear().domain(d3.extent(data.nodes, d => d.y)).range([H*0.12, H*0.88]);
  for (const n of data.nodes) {
    n.targetX = ix(n.x);
    n.targetY = iy(n.y);
    n.x = n.targetX;
    n.y = n.targetY;
  }

  // SVG + glow filter
  const svg = d3.select('#canvas').attr('width', W).attr('height', H);
  const defs = svg.append('defs');
  const fl = defs.append('filter').attr('id','glow').attr('x','-60%').attr('y','-60%').attr('width','220%').attr('height','220%');
  fl.append('feGaussianBlur').attr('in','SourceGraphic').attr('stdDeviation','5').attr('result','b');
  const fm = fl.append('feMerge');
  fm.append('feMergeNode').attr('in','b');
  fm.append('feMergeNode').attr('in','SourceGraphic');

  const root = svg.append('g');
  let currentK = 1;
  svg.call(d3.zoom().scaleExtent([0.04, 14]).on('zoom', e => {
    root.attr('transform', e.transform);
    currentK = e.transform.k;
    labels.style('display', currentK > 2.5 ? null : 'none');
  }));

  // Draw order: edges behind nodes
  const edges = root.selectAll('.edge').data(data.edges).join('line').attr('class','edge');

  const nodes = root.selectAll('.node').data(data.nodes).join('circle').attr('class','node')
    .attr('r', d => d.size).attr('fill', d => C[d.kind] ?? '#888')
    .on('mouseover', hoverIn).on('mousemove', (ev) => moveHtag(ev)).on('mouseout', hoverOut)
    .call(d3.drag()
      .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  const labels = root.selectAll('.label').data(data.nodes).join('text').attr('class','label')
    .attr('text-anchor','middle').text(d => d.what.length > 32 ? d.what.slice(0,32)+'…' : d.what)
    .style('display','none');

  // Compact PCA positions (40% of full range from center) — tighter, reveals clusters in vec mode
  for (const n of data.nodes) {
    n.compactX = W / 2 + (n.targetX - W / 2) * 0.4;
    n.compactY = H / 2 + (n.targetY - H / 2) * 0.4;
  }

  // Keep link force reference — do NOT recreate it after init (D3 mutates edges source/target to objects)
  const linkForce = d3.forceLink(data.edges)
    .id(d => d.id)
    .distance(d => 70 + d.source.size + d.target.size)
    .strength(0.25);

  const chargeForce = d3.forceManyBody().strength(d => -100 - d.size * 6).distanceMax(350);

  const sim = d3.forceSimulation(data.nodes)
    .force('link', linkForce)
    .force('charge', chargeForce)
    .force('collide', d3.forceCollide(d => d.size + 4).strength(0.8).iterations(2))
    .force('anchorX', d3.forceX(d => d.targetX).strength(0.12))
    .force('anchorY', d3.forceY(d => d.targetY).strength(0.12))
    .alphaDecay(0.012)
    .on('tick', () => {
      edges
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodes.attr('cx', d => d.x).attr('cy', d => d.y);
      labels.attr('x', d => d.x).attr('y', d => d.y + d.size + 11);
    });

  // Mode toggle: link topology ↔ vector clusters
  // link: pure force-directed — forceCenter keeps graph in view, strong charge spreads, links pull connected nodes
  // vec:  PCA anchor dominates — compact positions reveal clusters, links gently pull connected nodes closer within cluster
  let mode = 'default';
  const modeBtn = document.getElementById('modeBtn');
  modeBtn.addEventListener('click', () => {
    mode = mode === 'vec' ? 'link' : 'vec';
    modeBtn.textContent = mode === 'vec' ? 'link' : 'vettori';
    modeBtn.classList.toggle('vec', mode === 'vec');

    if (mode === 'link') {
      sim
        .force('center', d3.forceCenter(W / 2, H / 2).strength(0.08))
        .force('anchorX', null)
        .force('anchorY', null);
      chargeForce.strength(d => -220 - d.size * 8).distanceMax(500);
      linkForce.distance(d => 60 + d.source.size + d.target.size).strength(0.4);
    } else {
      sim
        .force('center', null)
        .force('anchorX', d3.forceX(d => d.compactX).strength(0.7))
        .force('anchorY', d3.forceY(d => d.compactY).strength(0.7));
      chargeForce.strength(-22).distanceMax(100);
      linkForce.distance(30).strength(0.12);
    }

    sim.alpha(0.8).restart();
  });

  // HUD + legend
  const kc = {};
  for (const n of data.nodes) kc[n.kind] = (kc[n.kind]||0)+1;
  document.getElementById('hud').innerHTML = data.nodes.length + ' nodi &nbsp;·&nbsp; ' + data.edges.length + ' archi';
  const leg = document.getElementById('legend');
  for (const [k, c] of Object.entries(C)) {
    if (!kc[k]) continue;
    leg.innerHTML += '<div class="li"><div class="dot" style="background:'+c+'"></div>'
      + L[k] + ' <span style="color:#444;margin-left:2px">'+kc[k]+'</span></div>';
  }

  // Hover: illuminate connected edges + show tags
  const htag = document.getElementById('htag');
  function hoverIn(ev, d) {
    edges.classed('edge-hover', e =>
      (e.source.id ?? e.source) === d.id || (e.target.id ?? e.target) === d.id
    );
    const tags = d.tags?.length ? d.tags.join(' · ') : '';
    if (tags) { htag.textContent = tags; htag.style.display = 'block'; moveHtag(ev); }
  }
  function moveHtag(ev) {
    htag.style.left = (ev.clientX + 14) + 'px';
    htag.style.top  = (ev.clientY - 22) + 'px';
  }
  function hoverOut() {
    edges.classed('edge-hover', false);
    htag.style.display = 'none';
  }

  // Search filter
  document.getElementById('sb').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) { nodes.style('opacity',1); labels.style('opacity',1); edges.style('opacity',1); return; }
    const m = new Set(data.nodes.filter(n =>
      n.what.toLowerCase().includes(q) || n.why.toLowerCase().includes(q) ||
      (n.tags||[]).some(t => t.toLowerCase().includes(q))
    ).map(n => n.id));
    nodes.style('opacity', d => m.has(d.id) ? 1 : 0.05);
    labels.style('opacity', d => m.has(d.id) ? 1 : 0);
    edges.style('opacity', d => m.has(d.source.id??d.source) && m.has(d.target.id??d.target) ? 0.5 : 0.02);
  });

  // WebSocket highlight from tb search
  function connectWS() {
    const ws = new WebSocket('ws://'+location.host+'/ws');
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type !== 'highlight') return;
      const ids = new Set(msg.ids);
      // Kick simulation so highlighted nodes visibly react
      sim.alpha(0.15).restart();
      nodes.classed('node-lit', d => ids.has(d.id))
        .filter(d => ids.has(d.id))
        .transition().duration(250).attr('r', d => d.size * 2.2)
        .transition().duration(600).attr('r', d => d.size * 1.5);
      edges.classed('edge-lit', d => ids.has(d.source.id??d.source) || ids.has(d.target.id??d.target));
      setTimeout(() => {
        nodes.classed('node-lit', false).transition().duration(1200).attr('r', d => d.size);
        edges.classed('edge-lit', false);
      }, 5000);
    };
    ws.onclose = () => setTimeout(connectWS, 2000);
    ws.onerror = () => ws.close();
  }
  connectWS();
})();
</script>
</body>
</html>`;
