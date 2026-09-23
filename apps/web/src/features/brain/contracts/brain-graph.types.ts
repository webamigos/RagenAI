import type {
  GraphCommunity,
  GraphEdge,
  GraphNode,
} from '@ragenai/brain-contracts';

/** What the graph page draws (spec D4). Plain data: it crosses into a client component. */
export type BrainGraphView = {
  nodes: (GraphNode & { openFindings: number })[];
  edges: GraphEdge[];
  communities: GraphCommunity[];
  shown: { nodes: number; edges: number };
  total: { nodes: number; edges: number };
  hiddenInferred: number;
  inferred: number;
  focus: string | null;
  budget: number;
  budgets: number[];
  hops: 1 | 2;
  includeInferred: boolean;
};
