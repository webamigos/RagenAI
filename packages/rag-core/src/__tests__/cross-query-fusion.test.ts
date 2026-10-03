import { describe, expect, it } from 'vitest';

import { fuseAcrossQueries } from '../selection/cross-query-fusion';

const doc = (pageContent: string) => ({ pageContent, metadata: {} });
const texts = (docs: { pageContent: string }[]) =>
  docs.map((d) => d.pageContent);

describe('fuseAcrossQueries', () => {
  it('puts a variant’s top hit ahead of the first query’s last hit', () => {
    // What the plain concatenation loses: with maxDocuments = 4, slice(0, 4)
    // of [a1..a4, b1..b4] never shows b1.
    const fused = fuseAcrossQueries([
      ['a1', 'a2', 'a3', 'a4'].map(doc),
      ['b1', 'b2', 'b3', 'b4'].map(doc),
    ]);
    expect(texts(fused).slice(0, 4)).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('ranks a chunk both queries found above one either found alone', () => {
    const fused = fuseAcrossQueries([
      ['a', 'shared', 'c'].map(doc),
      ['d', 'e', 'shared'].map(doc),
    ]);
    expect(texts(fused)[0]).toBe('shared');
  });

  it('is the list itself, deduped, for one query or identical queries', () => {
    const list = ['a', 'b', 'a', 'c'].map(doc);
    expect(texts(fuseAcrossQueries([list]))).toEqual(['a', 'b', 'c']);
    expect(
      texts(
        fuseAcrossQueries([['a', 'b', 'c'].map(doc), ['a', 'b', 'c'].map(doc)]),
      ),
    ).toEqual(['a', 'b', 'c']);
  });

  it('counts a chunk once per list, so a repeat cannot outrank the top hit', () => {
    expect(texts(fuseAcrossQueries([['a', 'b', 'b', 'c'].map(doc)]))).toEqual([
      'a',
      'b',
      'c',
    ]);
    // Still counted once in each of two lists.
    expect(
      texts(
        fuseAcrossQueries([['a', 'b', 'b'].map(doc), ['b', 'c'].map(doc)]),
      )[0],
    ).toBe('b');
  });

  it('keeps the first copy of a chunk, as the chains’ dedupe does', () => {
    const first = { pageContent: 'x', metadata: { fileId: 'f1' } };
    const second = { pageContent: 'x', metadata: { fileId: 'f2' } };
    expect(fuseAcrossQueries([[first], [second]])[0]).toBe(first);
  });

  it('returns nothing for no lists or empty lists', () => {
    expect(fuseAcrossQueries([])).toEqual([]);
    expect(fuseAcrossQueries([[], []])).toEqual([]);
  });
});
