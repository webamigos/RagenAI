import { MultiDirectedGraph } from 'graphology';
import { describe, expect, it } from 'vitest';

import {
  MIN_ISOLATED_TO_SHELVE,
  shelveIsolated,
} from '../components/shelve-isolated';

/** A connected pair spanning (0,0)–(10,10), plus `strays` pages with no relation flung far out. */
function graphWith(strays: number) {
  const graph = new MultiDirectedGraph();
  graph.addNode('a', { x: 0, y: 0 });
  graph.addNode('b', { x: 10, y: 10 });
  graph.addEdge('a', 'b');
  for (let i = 0; i < strays; i += 1) {
    const angle = (2 * Math.PI * i) / strays;
    graph.addNode(`s${i}`, {
      x: 5 + Math.cos(angle) * 200,
      y: 5 + Math.sin(angle) * 200,
    });
  }
  return graph;
}

const at = (g: MultiDirectedGraph, key: string) =>
  g.getNodeAttributes(key) as { x: number; y: number };

describe('shelveIsolated', () => {
  it('gathers the strays into a block left of the connected pages, within their height', () => {
    const graph = graphWith(12);
    expect(shelveIsolated(graph)).toBe(12);
    for (let i = 0; i < 12; i += 1) {
      const { x, y } = at(graph, `s${i}`);
      expect(x).toBeLessThan(0);
      expect(x).toBeGreaterThan(-10);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
    // The connected ones stay where the layout put them.
    expect(at(graph, 'a')).toMatchObject({ x: 0, y: 0 });
    expect(at(graph, 'b')).toMatchObject({ x: 10, y: 10 });
  });

  it('leaves a stray the operator pinned where it was put', () => {
    const graph = graphWith(12);
    graph.mergeNodeAttributes('s0', { x: 150, y: -80, fixed: true });
    expect(shelveIsolated(graph)).toBe(11);
    expect(at(graph, 's0')).toMatchObject({ x: 150, y: -80 });
  });

  it('puts no two strays on the same spot', () => {
    const graph = graphWith(20);
    shelveIsolated(graph);
    const spots = new Set(
      Array.from({ length: 20 }, (_, i) => {
        const { x, y } = at(graph, `s${i}`);
        return `${x.toFixed(6)},${y.toFixed(6)}`;
      }),
    );
    expect(spots.size).toBe(20);
  });

  it('leaves a stray or two where they are', () => {
    const graph = graphWith(MIN_ISOLATED_TO_SHELVE - 1);
    const before = at(graph, 's0');
    expect(shelveIsolated(graph)).toBe(0);
    expect(at(graph, 's0')).toEqual(before);
  });

  it('moves nothing when no page has a relation — there is no graph to sit beside', () => {
    const graph = new MultiDirectedGraph();
    for (let i = 0; i < 5; i += 1) {
      graph.addNode(`s${i}`, { x: i * 3, y: i });
    }
    expect(shelveIsolated(graph)).toBe(0);
    expect(at(graph, 's4')).toEqual({ x: 12, y: 4 });
  });
});
