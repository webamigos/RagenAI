import { describe, expect, it } from 'vitest';

import { BRAIN_LIST_LIMIT } from '../constants';
import { listRange, listSkip, parseListPage } from '../utils/list-page';

describe('parseListPage', () => {
  it('reads a whole number from 1', () => {
    expect(parseListPage('3')).toBe(3);
    expect(parseListPage(['2', '9'])).toBe(2);
  });

  it.each([undefined, '', '0', '-3', '2.5', 'abc', '1e3', '9999999'])(
    'falls back to the first batch for %s',
    (raw) => {
      expect(parseListPage(raw)).toBe(1);
    },
  );
});

describe('listSkip and listRange', () => {
  it('skip whole batches and name the rows shown', () => {
    expect(listSkip(1)).toBe(0);
    expect(listSkip(3)).toBe(2 * BRAIN_LIST_LIMIT);
    expect(listRange(1, 5)).toBe('1–5');
    expect(listRange(2, 3)).toBe(
      `${BRAIN_LIST_LIMIT + 1}–${BRAIN_LIST_LIMIT + 3}`,
    );
    expect(listRange(4, 0)).toBe('0');
  });
});
