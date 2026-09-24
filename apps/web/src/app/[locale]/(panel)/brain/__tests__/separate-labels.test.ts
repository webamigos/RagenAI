import { MultiDirectedGraph } from 'graphology';
import { describe, expect, it } from 'vitest';

import {
  canvasLabel,
  countLabelOverlaps,
  LABEL_MAX_CHARS,
  pixelsPerUnit,
  separateLabels,
} from '../components/separate-labels';

const VIEWPORT = { width: 1190, height: 840 };

/** A dense cluster of long names plus a few far-away pages — the demo graph's shape. */
function cluster(n: number) {
  const graph = new MultiDirectedGraph();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i += 1) {
    graph.addNode(String(i), {
      x: rnd() * 10,
      y: rnd() * 10,
      size: 8,
      label: canvasLabel(
        'Umowa powierzenia przetwarzania danych'.slice(0, 12 + (i % 24)),
      ),
    });
  }
  for (let i = 0; i < 6; i += 1) {
    graph.addNode(`far-${i}`, {
      x: 40 * rnd(),
      y: 40 * rnd(),
      size: 6,
      label: 'Opiekun nowego pracownika',
    });
  }
  return graph;
}

describe('separateLabels', () => {
  it('moves pages apart until no two names collide — at the demo graph’s size', () => {
    // 46 pages is what the demo's Brain holds; before this pass about 160
    // pairs of names drew over each other at the scale sigma fits them to.
    const graph = cluster(46);
    expect(countLabelOverlaps(graph, VIEWPORT)).toBeGreaterThan(100);

    separateLabels(graph, VIEWPORT);

    expect(countLabelOverlaps(graph, VIEWPORT)).toBe(0);
  });

  it('leaves a graph whose names already have room exactly where it was', () => {
    const graph = new MultiDirectedGraph();
    graph.addNode('a', { x: 0, y: 0, size: 6, label: 'A' });
    graph.addNode('b', { x: 0, y: 100, size: 6, label: 'B' });
    separateLabels(graph, VIEWPORT);
    expect(graph.getNodeAttribute('a', 'y')).toBe(0);
    expect(graph.getNodeAttribute('b', 'y')).toBe(100);
  });

  it('measures scale the way sigma does: the longer extent fitted to the shorter side', () => {
    const graph = new MultiDirectedGraph();
    graph.addNode('a', { x: 0, y: 0, size: 1, label: 'a' });
    graph.addNode('b', { x: 10, y: 2, size: 1, label: 'b' });
    // Shorter side 840, stage padding 60 each side → 720px for a span of 10.
    expect(pixelsPerUnit(graph, VIEWPORT)).toBeCloseTo(72);
  });
});

describe('canvasLabel', () => {
  it('shortens only what does not fit, and marks it', () => {
    expect(canvasLabel('Praca zdalna')).toBe('Praca zdalna');
    const long = 'Umowa powierzenia przetwarzania danych osobowych';
    const shown = canvasLabel(long);
    expect(shown.length).toBeLessThanOrEqual(LABEL_MAX_CHARS);
    expect(shown.endsWith('…')).toBe(true);
    expect(long.startsWith(shown.slice(0, -1))).toBe(true);
  });
});
