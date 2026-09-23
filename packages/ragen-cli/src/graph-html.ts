/**
 * `ragen brain graph --html <file>` — the graph as one page you open in a
 * browser, SwarmVault's `graph serve` without a server to leave running.
 *
 * The view is embedded as JSON inside a `<script type="application/json">`
 * with every `<` escaped, so a page title can never close the tag; titles
 * reach the page only as sigma labels (drawn on a canvas) and through
 * `textContent`. Sigma and graphology load from jsDelivr, pinned to the
 * majors the panel uses.
 */
export type GraphHtmlView = {
  nodes: {
    id: string;
    title: string;
    community: number;
    degree: number;
    openFindings?: number;
  }[];
  edges: { from: string; to: string; kind: string; origin: string }[];
  shown: { nodes: number; edges: number };
  total: { nodes: number; edges: number };
};

/** JSON safe to place inside a `<script>` element. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderGraphHtml(view: GraphHtmlView, title: string): string {
  const heading = title.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --fg: #1f2330; --muted: #6b7080; --border: #e3e5ea; }
  @media (prefers-color-scheme: dark) { :root { --bg: #14161c; --fg: #e8e9ee; --muted: #9a9fad; --border: #2a2d36; } }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
  header { padding: 10px 16px; border-bottom: 1px solid var(--border); display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  header p { margin: 0; color: var(--muted); font-size: 12px; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 280px; grid-template-rows: 100%; height: calc(100% - 45px); }
  #graph { height: 100%; min-height: 320px; }
  aside { border-left: 1px solid var(--border); padding: 12px 16px; overflow: auto; font-size: 12px; }
  aside h2 { font-size: 14px; margin: 0 0 6px; }
  aside ul { padding-left: 16px; color: var(--muted); }
  @media (max-width: 700px) { main { grid-template-columns: 1fr; grid-template-rows: 60% 40%; } aside { border-left: 0; border-top: 1px solid var(--border); } }
</style>
</head>
<body>
<header><strong>${heading}</strong><p id="summary"></p></header>
<main><div id="graph"></div><aside id="card"><p>Select a page to see its relations. Solid, thick edges are quoted from a document; thin ones are ambiguous; faint ones are the model's inference.</p></aside></main>
<script type="application/json" id="view">${embedJson(view)}</script>
<script type="module">
import Sigma from 'https://cdn.jsdelivr.net/npm/sigma@3/+esm';
import { MultiDirectedGraph } from 'https://cdn.jsdelivr.net/npm/graphology@0.26/+esm';
import forceAtlas2 from 'https://cdn.jsdelivr.net/npm/graphology-layout-forceatlas2@0.10/+esm';

const view = JSON.parse(document.getElementById('view').textContent);
const palette = ['#4f6bed', '#2f9e8f', '#c98a1b', '#8a5cd1', '#3d8bd9', '#6c8f3a'];
const size = { EXTRACTED: 1.6, AMBIGUOUS: 1, INFERRED: 0.6 };
const tone = { EXTRACTED: 'rgba(110,115,130,0.7)', AMBIGUOUS: 'rgba(201,138,27,0.8)', INFERRED: 'rgba(110,115,130,0.3)' };
document.getElementById('summary').textContent =
  view.shown.nodes + ' of ' + view.total.nodes + ' pages, ' + view.shown.edges + ' of ' + view.total.edges + ' relations';

const graph = new MultiDirectedGraph();
const groups = Math.max(1, ...view.nodes.map((n) => n.community + 1));
view.nodes.forEach((n, i) => {
  const a = (2 * Math.PI * n.community) / groups + i * 0.001;
  graph.addNode(n.id, {
    x: Math.cos(a) * (10 + (i % 7)), y: Math.sin(a) * (10 + (i % 7)),
    size: 4 + Math.sqrt(n.degree) * 2 + ((n.openFindings ?? 0) > 0 ? 4 : 0),
    label: n.title, color: palette[n.community % palette.length],
    forceLabel: (n.openFindings ?? 0) > 0,
  });
});
for (const e of view.edges) {
  if (graph.hasNode(e.from) && graph.hasNode(e.to)) {
    graph.addEdge(e.from, e.to, { size: size[e.origin] ?? 1, color: tone[e.origin] ?? tone.INFERRED, kind: e.kind, origin: e.origin });
  }
}
if (graph.order > 1) {
  forceAtlas2.assign(graph, { iterations: graph.order > 600 ? 80 : 150, settings: forceAtlas2.inferSettings(graph) });
}
let hovered = null;
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const renderer = new Sigma(graph, document.getElementById('graph'), {
  stagePadding: 60, labelRenderedSizeThreshold: 8,
  labelColor: { color: dark ? '#e8e9ee' : '#1f2330' },
  nodeReducer: (id, d) => (!hovered || id === hovered || graph.areNeighbors(id, hovered) ? d : { ...d, color: dark ? '#2a2d36' : '#e3e5ea', label: '' }),
  edgeReducer: (id, d) => (!hovered || graph.hasExtremity(id, hovered) ? d : { ...d, hidden: true }),
});
renderer.on('enterNode', ({ node }) => { hovered = node; renderer.refresh(); });
renderer.on('leaveNode', () => { hovered = null; renderer.refresh(); });
renderer.on('clickNode', ({ node }) => {
  const card = document.getElementById('card');
  card.replaceChildren();
  const h = document.createElement('h2');
  h.textContent = graph.getNodeAttribute(node, 'label');
  const list = document.createElement('ul');
  graph.forEachEdge(node, (edge, attrs, source, target) => {
    const li = document.createElement('li');
    const other = source === node ? target : source;
    li.textContent = attrs.kind + ' · ' + graph.getNodeAttribute(other, 'label') + ' · ' + attrs.origin.toLowerCase();
    list.append(li);
  });
  card.append(h, list);
});
</script>
</body>
</html>
`;
}
