import type { LabelledRow } from './dataset';

/**
 * The one split of the labelled set into a tuning half and a holdout half.
 *
 * Stratified by `set` and `lang`, so each half has the same mix of benign
 * rows, attacks and other-language rows in each language: a holdout that
 * happened to get most of the Polish attacks would measure a different
 * question from the tuning half. Seeded, so the split can be re-derived and
 * checked, and so nobody re-rolls it after seeing a result.
 */
export type Split<T> = { readonly tuning: T[]; readonly holdout: T[] };

/** mulberry32: small, seedable, good enough to shuffle a few hundred rows. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function splitStratified<T extends Pick<LabelledRow, 'set' | 'lang'>>(
  rows: readonly T[],
  seed: number,
): Split<T> {
  const next = random(seed);
  const strata = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.set}/${row.lang}`;
    strata.set(key, [...(strata.get(key) ?? []), row]);
  }
  const tuning: T[] = [];
  const holdout: T[] = [];
  // Strata in a fixed order, so the seed reproduces the split of a file
  // however its strata happen to be interleaved.
  for (const key of [...strata.keys()].sort()) {
    const group = [...strata.get(key)!];
    for (let i = group.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    // An odd stratum gives its extra row to the holdout: the holdout's attack
    // count is what bounds the false-clearance rate, so it gets the spare.
    const half = Math.floor(group.length / 2);
    tuning.push(...group.slice(0, half));
    holdout.push(...group.slice(half));
  }
  return { tuning, holdout };
}
