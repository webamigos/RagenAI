import { knowledgeGraphSchema } from '@ragenai/brain-contracts';
import { describe, expect, it } from 'vitest';

import {
  assembleGraph,
  type GraphEdgeInput,
  type GraphPageInput,
} from '../assemble-graph';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const page = (
  n: number,
  over: Partial<GraphPageInput> = {},
): GraphPageInput => ({
  id: id(n),
  title: `Page ${n}`,
  type: 'PROCESS',
  status: 'APPROVED',
  ...over,
});
const edge = (
  from: number,
  to: number,
  over: Partial<GraphEdgeInput> = {},
): GraphEdgeInput => ({
  from: id(from),
  to: id(to),
  kind: 'relates to',
  origin: 'EXTRACTED',
  confidence: null,
  ...over,
});

/** Two triangles joined by a single guessed edge. */
function twoClusters() {
  const pages = [1, 2, 3, 4, 5, 6].map((n) => page(n));
  const edges = [
    edge(1, 2),
    edge(2, 3),
    edge(3, 1),
    edge(4, 5),
    edge(5, 6),
    edge(6, 4),
    edge(3, 4, { origin: 'INFERRED' }),
  ];
  return { pages, edges };
}

describe('assembleGraph', () => {
  it('produces a graph the bundle contract accepts', () => {
    const { pages, edges } = twoClusters();
    const { graph } = assembleGraph(pages, edges);
    expect(knowledgeGraphSchema.safeParse(graph).success).toBe(true);
  });

  it('finds the two communities a guessed bridge does not merge', () => {
    const { pages, edges } = twoClusters();
    const { graph, stats } = assembleGraph(pages, edges);
    const community = (n: number) =>
      graph.nodes.find((node) => node.id === id(n))!.community;
    expect(community(1)).toBe(community(2));
    expect(community(2)).toBe(community(3));
    expect(community(4)).toBe(community(5));
    expect(community(1)).not.toBe(community(4));
    expect(stats).toMatchObject({ communities: 2, components: 1, isolated: 0 });
    expect(stats.modularity).toBeGreaterThan(0.3);
  });

  // The origin is never merged away.
  it('keeps a stated and a guessed edge between the same pages apart', () => {
    const { graph, stats } = assembleGraph(
      [page(1), page(2)],
      [edge(1, 2), edge(1, 2, { origin: 'INFERRED', confidence: 0.4 })],
    );
    expect(graph.edges.map((e) => e.origin)).toEqual(['EXTRACTED', 'INFERRED']);
    expect(stats.edgesByOrigin).toEqual({
      EXTRACTED: 1,
      INFERRED: 1,
      AMBIGUOUS: 0,
    });
    // Counted once as a neighbour, whatever the number of edges to it.
    expect(graph.nodes.map((n) => n.degree)).toEqual([1, 1]);
  });

  it('drops edges to pages it was not given, and self-loops', () => {
    const { graph } = assembleGraph(
      [page(1), page(2)],
      [edge(1, 2), edge(1, 99), edge(2, 2)],
    );
    expect(graph.edges).toHaveLength(1);
    expect(knowledgeGraphSchema.safeParse(graph).success).toBe(true);
  });

  it('drops an exact duplicate edge', () => {
    const { graph } = assembleGraph(
      [page(1), page(2)],
      [edge(1, 2), edge(1, 2)],
    );
    expect(graph.edges).toHaveLength(1);
  });

  it('puts every page of an edgeless graph in its own community', () => {
    const { graph, stats } = assembleGraph([page(1), page(2), page(3)], []);
    expect(new Set(graph.nodes.map((n) => n.community)).size).toBe(3);
    expect(stats).toMatchObject({
      isolated: 3,
      components: 3,
      communities: 3,
      modularity: 0,
    });
  });

  it('handles no pages at all', () => {
    const { graph, stats } = assembleGraph([], []);
    expect(graph).toMatchObject({ nodes: [], edges: [], communities: [] });
    expect(stats.nodes).toBe(0);
  });

  // A browsed graph must not regroup on reload, nor two exports differ.
  it('gives identical output for the same input in any order', () => {
    const { pages, edges } = twoClusters();
    const a = assembleGraph(pages, edges);
    const b = assembleGraph([...pages].reverse(), [...edges].reverse());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('numbers communities largest first and labels each by its hub', () => {
    const pages = [
      page(1, { title: 'Hub' }),
      page(2),
      page(3),
      page(4),
      page(5, { title: 'Pair A' }),
      page(6, { title: 'Pair B' }),
    ];
    const edges = [edge(1, 2), edge(1, 3), edge(1, 4), edge(2, 3), edge(5, 6)];
    const { graph } = assembleGraph(pages, edges);
    expect(graph.communities.map((c) => [c.size, c.label])).toEqual([
      [4, 'Hub'],
      [2, 'Pair A'],
    ]);
  });

  // Page 0 is stated once to belong with the triangle 1-2-3, and only
  // guessed (AMBIGUOUS) to relate to four pages of the clique 4-8. Counted
  // as equals, the four guesses would pull it into the clique.
  it('weighs a stated edge above a guess when grouping', () => {
    const pages = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => page(n));
    const edges = [edge(1, 2), edge(2, 3), edge(1, 3), edge(0, 1)];
    for (let a = 4; a <= 8; a++) {
      for (let b = a + 1; b <= 8; b++) {
        edges.push(edge(a, b));
      }
    }
    for (const b of [4, 5, 6, 7]) {
      edges.push(edge(0, b, { origin: 'AMBIGUOUS' }));
    }
    const { graph } = assembleGraph(pages, edges);
    const community = (n: number) =>
      graph.nodes.find((node) => node.id === id(n))!.community;
    expect(community(0)).toBe(community(1));
    expect(community(0)).not.toBe(community(4));
  });

  // A ring has several equally good partitions, and an unseeded Louvain
  // picks a different one from run to run.
  it('partitions an ambiguous graph the same way every time', () => {
    const pages = Array.from({ length: 12 }, (_, n) => page(n));
    const edges = pages.map((_, n) => edge(n, (n + 1) % 12));
    const first = JSON.stringify(assembleGraph(pages, edges).graph);
    for (let run = 0; run < 20; run++) {
      expect(JSON.stringify(assembleGraph(pages, edges).graph)).toBe(first);
    }
  });
});
