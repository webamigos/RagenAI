import type { KnowledgeGraph } from '@ragenai/brain-contracts';
import { describe, expect, it } from 'vitest';

import { selectGraphView } from '../select-view';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const node = (n: number, degree: number, community = 0) => ({
  id: id(n),
  title: `P${n}`,
  type: 'ENTITY' as const,
  status: 'CANDIDATE' as const,
  community,
  degree,
});
const edge = (
  a: number,
  b: number,
  origin: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' = 'EXTRACTED',
) => ({
  from: id(a),
  to: id(b),
  kind: 'rel',
  origin,
  confidence: null,
});

// 1 — 2 — 3 — 4, plus 5 related to 1 only by the model's guess, 6 alone.
const graph: KnowledgeGraph = {
  formatVersion: 1,
  nodes: [
    node(1, 2),
    node(2, 2),
    node(3, 2),
    node(4, 1, 1),
    node(5, 1, 2),
    node(6, 0, 3),
  ],
  edges: [
    edge(1, 2),
    edge(2, 3),
    edge(3, 4, 'AMBIGUOUS'),
    edge(1, 5, 'INFERRED'),
  ],
  communities: [
    { id: 0, size: 3, label: 'P1' },
    { id: 1, size: 1, label: 'P4' },
    { id: 2, size: 1, label: 'P5' },
    { id: 3, size: 1, label: 'P6' },
  ],
};
const base = {
  budget: 150 as const,
  focus: null,
  hops: 1 as const,
  includeInferred: false,
  pinned: new Set<string>(),
};

describe('selectGraphView', () => {
  it('hides INFERRED edges unless asked, and counts totals under the same filter', () => {
    const view = selectGraphView(graph, base);
    expect(view.edges.map((e) => e.origin)).toEqual([
      'EXTRACTED',
      'EXTRACTED',
      'AMBIGUOUS',
    ]);
    expect(view.hiddenInferred).toBe(1);
    expect(view.inferred).toBe(1);
    expect(
      selectGraphView(graph, { ...base, includeInferred: true }),
    ).toMatchObject({
      hiddenInferred: 0,
      inferred: 1,
    });
    expect(view.total).toEqual({ nodes: 6, edges: 3 });
    expect(
      selectGraphView(graph, { ...base, includeInferred: true }).total.edges,
    ).toBe(4);
  });

  it('spends the budget on pinned pages first, then the most connected', () => {
    // The budgets offered start at 150; a smaller one shows the cut.
    const view = selectGraphView(graph, {
      ...base,
      budget: 3 as never,
      pinned: new Set([id(6)]),
    });
    expect(view.nodes.map((n) => n.id)).toEqual([id(6), id(1), id(2)]);
    expect(view.shown).toEqual({ nodes: 3, edges: 1 });
    expect(view.total).toEqual({ nodes: 6, edges: 3 });
    for (const e of view.edges) {
      expect([id(1), id(2), id(6)]).toContain(e.from);
      expect([id(1), id(2), id(6)]).toContain(e.to);
    }
  });

  it('draws a neighbourhood by hops, nearest first', () => {
    const one = selectGraphView(graph, { ...base, focus: id(2), hops: 1 });
    expect(one.nodes.map((n) => n.id).sort()).toEqual(
      [id(1), id(2), id(3)].sort(),
    );
    expect(one.nodes[0]!.id).toBe(id(2));
    expect(one.focus).toBe(id(2));
    const two = selectGraphView(graph, { ...base, focus: id(2), hops: 2 });
    expect(two.nodes.map((n) => n.id)).toContain(id(4));
    // 5 is reachable only through an INFERRED edge, which is hidden.
    expect(two.nodes.map((n) => n.id)).not.toContain(id(5));
  });

  it('falls back to the overview for a focus that is not in the graph', () => {
    const view = selectGraphView(graph, { ...base, focus: id(99) });
    expect(view.focus).toBeNull();
    expect(view.shown.nodes).toBe(6);
  });

  it('keeps only the communities of drawn nodes', () => {
    const view = selectGraphView(graph, { ...base, focus: id(1), hops: 1 });
    expect(view.communities.map((c) => c.id)).toEqual([0]);
  });
});
