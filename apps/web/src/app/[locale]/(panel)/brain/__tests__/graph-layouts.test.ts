import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearLayout,
  loadLayout,
  MAX_NODES_PER_VIEW,
  MAX_VIEWS,
  saveLayout,
  viewKey,
} from '../components/graph-layouts';

const overview = viewKey({
  focus: null,
  hops: 1,
  budget: 150,
  includeInferred: false,
});

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('viewKey', () => {
  it('tells apart every control that picks a different view', () => {
    const base = { focus: null, hops: 1, budget: 150, includeInferred: false };
    const keys = new Set([
      viewKey(base),
      viewKey({ ...base, focus: 'p1' }),
      viewKey({ ...base, focus: 'p1', hops: 2 }),
      viewKey({ ...base, budget: 300 }),
      viewKey({ ...base, includeInferred: true }),
    ]);
    expect(keys.size).toBe(5);
  });
});

describe('layouts', () => {
  it('bring a view back as it was saved, and only that view', () => {
    saveLayout(overview, { a: { x: 1.5, y: -2 }, b: { x: 3, y: 4 } });
    expect(loadLayout(overview)).toEqual({
      a: { x: 1.5, y: -2 },
      b: { x: 3, y: 4 },
    });
    expect(
      loadLayout(
        viewKey({ focus: 'a', hops: 1, budget: 150, includeInferred: false }),
      ),
    ).toEqual({});
  });

  it('are replaced whole by the next save, not merged', () => {
    saveLayout(overview, { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } });
    saveLayout(overview, { a: { x: 5, y: 5 } });
    expect(loadLayout(overview)).toEqual({ a: { x: 5, y: 5 } });
  });

  it('keep four decimals — far below a pixel', () => {
    saveLayout(overview, { a: { x: 1.234567, y: 0.000051 } });
    expect(loadLayout(overview)).toEqual({ a: { x: 1.2346, y: 0.0001 } });
  });

  it('are forgotten by clearing the view, and only that view', () => {
    const other = viewKey({
      focus: null,
      hops: 1,
      budget: 300,
      includeInferred: false,
    });
    saveLayout(overview, { a: { x: 1, y: 1 } });
    saveLayout(other, { b: { x: 2, y: 2 } });
    clearLayout(overview);
    expect(loadLayout(overview)).toEqual({});
    expect(loadLayout(other)).toEqual({ b: { x: 2, y: 2 } });
  });

  it('drop what is malformed instead of placing a page at NaN', () => {
    window.localStorage.setItem(
      'ragen.brain-graph.layouts',
      JSON.stringify({
        v: 1,
        views: {
          [overview]: {
            at: 1,
            nodes: { a: { x: 1, y: 2 }, b: { x: 'no', y: 2 }, c: null },
          },
        },
      }),
    );
    expect(loadLayout(overview)).toEqual({ a: { x: 1, y: 2 } });
    saveLayout(overview, { d: { x: Number.NaN, y: 0 }, e: { x: 1, y: 1 } });
    expect(loadLayout(overview)).toEqual({ e: { x: 1, y: 1 } });
  });

  it('start over from storage that is not theirs', () => {
    window.localStorage.setItem('ragen.brain-graph.layouts', '{not json');
    expect(loadLayout(overview)).toEqual({});
    saveLayout(overview, { a: { x: 1, y: 1 } });
    expect(loadLayout(overview)).toEqual({ a: { x: 1, y: 1 } });
  });

  it('forget the least recently arranged view past the cap', () => {
    for (let i = 0; i <= MAX_VIEWS; i += 1) {
      saveLayout(`view-${i}`, { a: { x: i, y: 0 } }, 1000 + i);
    }
    expect(loadLayout('view-0')).toEqual({});
    expect(loadLayout(`view-${MAX_VIEWS}`)).toEqual({
      a: { x: MAX_VIEWS, y: 0 },
    });
  });

  it('hold no more pages than the largest view the graph draws', () => {
    const layout = Object.fromEntries(
      Array.from({ length: MAX_NODES_PER_VIEW + 5 }, (_, i) => [
        `p${i}`,
        { x: i, y: 0 },
      ]),
    );
    saveLayout(overview, layout);
    expect(Object.keys(loadLayout(overview))).toHaveLength(MAX_NODES_PER_VIEW);
  });

  it('work without storage: nothing remembered, nothing thrown', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveLayout(overview, { a: { x: 1, y: 1 } })).not.toThrow();
    expect(loadLayout(overview)).toEqual({});
    expect(() => clearLayout(overview)).not.toThrow();
  });
});
