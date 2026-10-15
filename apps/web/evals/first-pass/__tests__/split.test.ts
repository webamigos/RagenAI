import { describe, expect, it } from 'vitest';

import type { LabelledRow, RowLang, RowSet } from '../lib/dataset';
import { splitStratified } from '../lib/split';

type Row = Pick<LabelledRow, 'set' | 'lang'> & { readonly id: string };

const stratum = (count: number, set: RowSet, lang: RowLang): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${set}-${lang}-${i}`,
    set,
    lang,
  }));

const rows: readonly Row[] = [
  ...stratum(21, 'attack', 'pl'),
  ...stratum(20, 'attack', 'en'),
  ...stratum(30, 'benign', 'en'),
  ...stratum(3, 'other-language', 'de'),
];

describe('splitStratified', () => {
  it('halves every set and language, the spare row going to the holdout', () => {
    const { tuning, holdout } = splitStratified(rows, 7);
    const count = (part: typeof tuning, set: string, lang: string) =>
      part.filter((r) => r.set === set && r.lang === lang).length;

    expect([
      count(tuning, 'attack', 'pl'),
      count(holdout, 'attack', 'pl'),
    ]).toEqual([10, 11]);
    expect([
      count(tuning, 'attack', 'en'),
      count(holdout, 'attack', 'en'),
    ]).toEqual([10, 10]);
    expect([
      count(tuning, 'benign', 'en'),
      count(holdout, 'benign', 'en'),
    ]).toEqual([15, 15]);
    expect([
      count(tuning, 'other-language', 'de'),
      count(holdout, 'other-language', 'de'),
    ]).toEqual([1, 2]);
  });

  it('puts every row in exactly one half', () => {
    const { tuning, holdout } = splitStratified(rows, 7);
    const ids = [...tuning, ...holdout].map((r) => r.id);

    expect(new Set(ids).size).toBe(rows.length);
    expect(ids).toHaveLength(rows.length);
  });

  it('is reproducible from its seed and keeps stratum sizes', () => {
    const a = splitStratified(rows, 42);
    const b = splitStratified([...rows].reverse(), 42);
    const ids = (part: typeof a.tuning) => part.map((r) => r.id).sort();

    // The order inside a stratum is the shuffle's input, so a reordered file
    // may pick different rows. The seed reproduces the split of one file.
    expect(ids(splitStratified(rows, 42).tuning)).toEqual(ids(a.tuning));
    expect(b.tuning).toHaveLength(a.tuning.length);
    expect(ids(splitStratified(rows, 43).tuning)).not.toEqual(ids(a.tuning));
  });
});
