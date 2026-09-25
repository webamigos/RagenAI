/**
 * Pages with no relation in the view, gathered into a tidy block beside the
 * connected ones.
 *
 * ForceAtlas2 repels every pair of nodes and pulls only along edges, so a page
 * with no edge drifts outward until nothing pushes it: a ring of stray dots
 * around the graph. The ring set the camera's fit, which then zoomed out far
 * enough to cram the connected graph — the part being read — into the middle,
 * names running together.
 */

export type ShelvableGraph = {
  forEachNode(
    fn: (key: string, attributes: Record<string, unknown>) => void,
  ): void;
  degree(key: string): number;
  setNodeAttribute(key: string, name: string, value: unknown): unknown;
};

/** Below this many strays they sit where the layout left them. */
export const MIN_ISOLATED_TO_SHELVE = 3;

/**
 * Moves every node of degree 0 into a grid to the left of the others'
 * bounding box, rows top to bottom in the order the graph lists them (the
 * server's order: open findings first, then the most connected). Returns how
 * many it moved. Nothing moves when there are too few strays, or when there
 * is no connected part to sit beside.
 */
export function shelveIsolated(graph: ShelvableGraph): number {
  const isolated: string[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let connected = 0;
  graph.forEachNode((key, a) => {
    // A page the operator pinned stays where it was put, stray or not.
    if (graph.degree(key) === 0 && a.fixed !== true) {
      isolated.push(key);
      return;
    }
    connected += 1;
    const x = a.x as number;
    const y = a.y as number;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  if (isolated.length < MIN_ISOLATED_TO_SHELVE || connected < 2) {
    return 0;
  }

  const height = Math.max(maxY - minY, 1);
  const width = Math.max(maxX - minX, 1);
  // A block about as tall as the graph and narrow beside it: more rows than
  // columns, so it reads as a margin and not a second graph.
  const rows = Math.max(1, Math.ceil(Math.sqrt(isolated.length * 2)));
  // Spread over the graph's height, but no cell larger than a tenth of it:
  // a few strays sit close together instead of spanning the whole side.
  const cell = Math.min(height / Math.max(rows - 1, 1), height / 10) || 1;
  const gap = Math.max(cell * 2, width * 0.08);
  const top = (minY + maxY) / 2 + ((rows - 1) * cell) / 2;

  isolated.forEach((key, i) => {
    const row = i % rows;
    const column = Math.floor(i / rows);
    // The first column nearest the graph, so the pages listed first are.
    graph.setNodeAttribute(key, 'x', minX - gap - column * cell);
    graph.setNodeAttribute(key, 'y', top - row * cell);
  });
  return isolated.length;
}
