import type {
  GraphCommunity,
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
} from '@ragenai/brain-contracts';

/** The node budgets the graph view offers; the server clamps to these. */
export const GRAPH_BUDGETS = [150, 300, 600, 1000] as const;
export type GraphBudget = (typeof GRAPH_BUDGETS)[number];

export type GraphViewOptions = {
  budget: GraphBudget;
  /** A page's id: show its neighbourhood instead of the overview. */
  focus: string | null;
  /** How far the neighbourhood reaches, in edges. */
  hops: 1 | 2;
  /**
   * INFERRED edges are the model's guess, not a sentence in a source; hidden
   * unless asked for, so the default picture is one a reader can check.
   */
  includeInferred: boolean;
  /** Ids always kept in the overview — pages with open findings. */
  pinned: ReadonlySet<string>;
};

export type GraphView = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  communities: GraphCommunity[];
  /** What the view drew, and what it could have — counted the same way. */
  shown: { nodes: number; edges: number };
  total: { nodes: number; edges: number };
  /** INFERRED edges left out by `includeInferred: false`. */
  hiddenInferred: number;
  /** INFERRED edges in the whole graph, whether shown or not. */
  inferred: number;
  /** The focus, when it names a page in the graph; null otherwise. */
  focus: string | null;
};

/**
 * The part of the organization's graph the panel draws (spec D4).
 *
 * The whole graph is never sent: a real corpus is thousands of pages, and a
 * graph that hangs the tab is a demo that fails at the customer's volume.
 *
 * - **Overview**: pages with open findings first (they are what curation is
 *   for), then the most connected, until the budget is spent.
 * - **Neighbourhood**: the focus and everything within `hops` edges of it,
 *   nearest first, then most connected, within the same budget.
 *
 * Edges are kept only between drawn nodes. `total` counts the graph under the
 * same edge filter as `shown`, so "150 of 325" compares like with like — a
 * total that silently included hidden INFERRED edges would not.
 */
export function selectGraphView(
  graph: KnowledgeGraph,
  options: GraphViewOptions,
): GraphView {
  const edges = graph.edges.filter(
    (e) => options.includeInferred || e.origin !== 'INFERRED',
  );
  const hiddenInferred = graph.edges.length - edges.length;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const byDegree = (a: GraphNode, b: GraphNode) =>
    b.degree - a.degree || a.title.localeCompare(b.title) || cmp(a.id, b.id);

  const focus = options.focus && byId.has(options.focus) ? options.focus : null;
  let chosen: GraphNode[];
  if (focus) {
    const neighbours = new Map<string, string[]>();
    const link = (a: string, b: string) => {
      const list = neighbours.get(a) ?? [];
      list.push(b);
      neighbours.set(a, list);
    };
    for (const e of edges) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    const distance = new Map<string, number>([[focus, 0]]);
    let frontier = [focus];
    for (let hop = 1; hop <= options.hops; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of neighbours.get(id) ?? []) {
          if (!distance.has(n)) {
            distance.set(n, hop);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    chosen = [...distance.keys()]
      .map((id) => byId.get(id)!)
      .sort(
        (a, b) => distance.get(a.id)! - distance.get(b.id)! || byDegree(a, b),
      )
      .slice(0, options.budget);
  } else {
    const pinned = graph.nodes
      .filter((n) => options.pinned.has(n.id))
      .sort(byDegree);
    const rest = graph.nodes
      .filter((n) => !options.pinned.has(n.id))
      .sort(byDegree);
    chosen = [...pinned, ...rest].slice(0, options.budget);
  }

  const ids = new Set(chosen.map((n) => n.id));
  const shownEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const used = new Set(chosen.map((n) => n.community));
  return {
    nodes: chosen,
    edges: shownEdges,
    communities: graph.communities.filter((c) => used.has(c.id)),
    shown: { nodes: chosen.length, edges: shownEdges.length },
    total: { nodes: graph.nodes.length, edges: edges.length },
    hiddenInferred,
    inferred: graph.edges.filter((e) => e.origin === 'INFERRED').length,
    focus,
  };
}

function cmp(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
