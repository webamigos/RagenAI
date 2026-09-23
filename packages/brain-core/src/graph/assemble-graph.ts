import {
  GRAPH_FORMAT_VERSION,
  type GraphCommunity,
  type GraphEdge,
  type GraphNode,
  type KnowledgeEdgeOrigin,
  type KnowledgeGraph,
  type KnowledgePageStatus,
  type KnowledgePageType,
} from '@ragenai/brain-contracts';
import { UndirectedGraph } from 'graphology';
import louvain from 'graphology-communities-louvain';

export type GraphPageInput = {
  /** The page's `publicId` — what the graph names it by. */
  id: string;
  title: string;
  type: KnowledgePageType;
  status: KnowledgePageStatus;
};

export type GraphEdgeInput = {
  from: string;
  to: string;
  kind: string;
  origin: KnowledgeEdgeOrigin;
  confidence: number | null;
};

/**
 * How much an edge of each origin counts toward a community. A stated
 * relation holds pages together; a guess is weaker evidence that they belong
 * together, and an unverified claim of one weaker still. It changes only the
 * grouping — every edge is in the output with its own origin.
 */
export const ORIGIN_WEIGHT: Record<KnowledgeEdgeOrigin, number> = {
  EXTRACTED: 1,
  INFERRED: 0.5,
  AMBIGUOUS: 0.25,
};

/**
 * Louvain is randomised; a graph a person browses must not regroup itself on
 * every reload, nor an exported bundle differ between two exports of the
 * same pages. A fixed seed makes it a function of its input.
 */
const SEED = 0x5eed;

export type GraphStats = {
  nodes: number;
  edges: number;
  /** Pages with no edge at all — ORPHAN's population, counted here too. */
  isolated: number;
  /** Connected components, isolated pages included. */
  components: number;
  communities: number;
  /** Of the communities' partition; 0 when there is no edge to partition. */
  modularity: number;
  edgesByOrigin: Record<KnowledgeEdgeOrigin, number>;
};

/**
 * The pages and their edges as `graph.json` (spec C4), with communities.
 *
 * Two structures, deliberately. The **output keeps every edge as extracted**:
 * the same two pages related once by a quoted sentence and once by the
 * model's guess are two edges, because merging them would present the guess
 * with the citation's authority. The **community detection runs over a
 * collapsed, undirected, weighted copy** — Louvain does not take a multigraph
 * — where each pair's weight is the sum of its edges' `ORIGIN_WEIGHT`.
 *
 * Edges naming a page not in `pages` are dropped, as are self-loops: a graph
 * built over a subset (an export carries approved pages only) must not name
 * the pages it left out. Nodes and edges come out sorted, and communities
 * are numbered by size, largest first, then by their label — so the same
 * pages give byte-identical output.
 */
export function assembleGraph(
  pages: ReadonlyArray<GraphPageInput>,
  edges: ReadonlyArray<GraphEdgeInput>,
): { graph: KnowledgeGraph; stats: GraphStats } {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const kept: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to)) {
      continue;
    }
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.kind}\u0000${edge.origin}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push({ ...edge });
  }
  kept.sort(
    (a, b) =>
      cmp(a.from, b.from) ||
      cmp(a.to, b.to) ||
      cmp(a.kind, b.kind) ||
      cmp(a.origin, b.origin),
  );

  const collapsed = new UndirectedGraph<
    Record<string, never>,
    { weight: number }
  >();
  const ids = [...byId.keys()].sort(cmp);
  for (const id of ids) {
    collapsed.addNode(id);
  }
  for (const edge of kept) {
    const weight = ORIGIN_WEIGHT[edge.origin];
    if (collapsed.hasEdge(edge.from, edge.to)) {
      collapsed.updateEdgeAttribute(
        edge.from,
        edge.to,
        'weight',
        (w) => (w ?? 0) + weight,
      );
    } else {
      collapsed.addEdge(edge.from, edge.to, { weight });
    }
  }

  let raw: Record<string, number>;
  let modularity = 0;
  if (collapsed.size === 0) {
    // Louvain over no edges puts every node alone anyway; say so directly
    // rather than depend on how the library treats an empty partition.
    raw = Object.fromEntries(ids.map((id, i) => [id, i]));
  } else {
    const detailed = louvain.detailed(collapsed, {
      getEdgeWeight: 'weight',
      rng: mulberry32(SEED),
    });
    raw = detailed.communities;
    modularity = detailed.modularity;
  }

  const degree = (id: string) => collapsed.degree(id);
  const members = new Map<number, string[]>();
  for (const id of ids) {
    const list = members.get(raw[id]) ?? [];
    list.push(id);
    members.set(raw[id], list);
  }
  const groups = [...members.values()].map((list) => {
    const hub = [...list].sort(
      (a, b) =>
        degree(b) - degree(a) ||
        cmp(byId.get(a)!.title, byId.get(b)!.title) ||
        cmp(a, b),
    )[0];
    return { list, label: byId.get(hub)!.title };
  });
  groups.sort(
    (a, b) =>
      b.list.length - a.list.length ||
      cmp(a.label, b.label) ||
      cmp(a.list[0], b.list[0]),
  );
  const communityOf = new Map<string, number>();
  const communities: GraphCommunity[] = groups.map((group, index) => {
    for (const id of group.list) {
      communityOf.set(id, index);
    }
    return { id: index, size: group.list.length, label: group.label };
  });

  const nodes: GraphNode[] = ids.map((id) => {
    const page = byId.get(id)!;
    return {
      id,
      title: page.title,
      type: page.type,
      status: page.status,
      community: communityOf.get(id)!,
      degree: degree(id),
    };
  });

  const edgesByOrigin: Record<KnowledgeEdgeOrigin, number> = {
    EXTRACTED: 0,
    INFERRED: 0,
    AMBIGUOUS: 0,
  };
  for (const edge of kept) {
    edgesByOrigin[edge.origin] += 1;
  }

  return {
    graph: {
      formatVersion: GRAPH_FORMAT_VERSION,
      nodes,
      edges: kept,
      communities,
    },
    stats: {
      nodes: nodes.length,
      edges: kept.length,
      isolated: nodes.filter((n) => n.degree === 0).length,
      components: countComponents(collapsed),
      communities: communities.length,
      modularity,
      edgesByOrigin,
    },
  };
}

function countComponents(graph: UndirectedGraph): number {
  const seen = new Set<string>();
  let count = 0;
  graph.forEachNode((start) => {
    if (seen.has(start)) {
      return;
    }
    count += 1;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      graph.forEachNeighbor(node, (next) => {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      });
    }
  });
  return count;
}

function cmp(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** A small seeded PRNG — enough for Louvain's shuffles, and deterministic. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
