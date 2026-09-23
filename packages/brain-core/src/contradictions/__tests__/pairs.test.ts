import { describe, expect, it } from 'vitest';

import { contradictionPairs, type ContradictionPageInput } from '../pairs';

const page = (
  id: number,
  title: string,
  fileIds: string[],
): ContradictionPageInput => ({ id, title, fileIds });

describe('contradictionPairs', () => {
  it('pairs pages about the same subject from different documents', () => {
    const pages = [
      page(1, 'Urlop wypoczynkowy', ['f1']),
      page(2, 'Urlop  wypoczynkowy', ['f2']),
      page(3, 'Delegacje', ['f2']),
    ];
    expect(contradictionPairs(pages, new Set([2]))).toEqual([[1, 2]]);
  });

  it('matches titles as extraction does — case, diacritics, punctuation', () => {
    const pages = [
      page(1, 'Zasady Urlopów', ['f1']),
      page(2, 'zasady urlopow!', ['f2']),
    ];
    expect(contradictionPairs(pages, new Set([1]))).toEqual([[1, 2]]);
  });

  // A re-extraction of one document beside itself.
  it('does not pair two pages citing exactly the same files', () => {
    const pages = [
      page(1, 'Urlop', ['f1', 'f2']),
      page(2, 'Urlop', ['f2', 'f1', 'f1']),
    ];
    expect(contradictionPairs(pages, new Set([1, 2]))).toEqual([]);
  });

  it('pairs pages whose files overlap without being the same', () => {
    const pages = [page(1, 'Urlop', ['f1', 'f2']), page(2, 'Urlop', ['f2'])];
    expect(contradictionPairs(pages, new Set([2]))).toEqual([[1, 2]]);
  });

  // An old pair was judged when the second of them was written.
  it('skips a pair neither of whose pages is new', () => {
    const pages = [
      page(1, 'Urlop', ['f1']),
      page(2, 'Urlop', ['f2']),
      page(3, 'Urlop', ['f3']),
    ];
    expect(contradictionPairs(pages, new Set([3]))).toEqual([
      [1, 3],
      [2, 3],
    ]);
  });

  it('orders each pair smaller id first, and names it once', () => {
    const pages = [page(9, 'Urlop', ['f1']), page(4, 'Urlop', ['f2'])];
    expect(contradictionPairs(pages, new Set([4, 9]))).toEqual([[4, 9]]);
  });
});
