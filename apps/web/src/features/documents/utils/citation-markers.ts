import type { RetrievedSource } from '@/libs/chains/types/common';

/**
 * The `[n]` markers an answer actually earned.
 *
 * The model is asked to cite by number, and a number is a claim: `[3]` says
 * *this sentence came from the third document you showed me*. Unlike a file
 * name, nothing about the shape of `[3]` says whether it is true — so it is
 * checked against the retrieved set, which is the only thing that can.
 *
 * A marker outside that range is dropped. Gap 2 puts it plainly: a marker
 * pointing at something that was never retrieved is worse than no marker at
 * all, because a reader has no way to tell one from the other.
 */
export type CitationMarkers = {
  /** Source numbers the answer cited, in ascending order, all valid. */
  numbers: number[];
  /** The corresponding files, for `DocumentCitation` and the sources block. */
  sources: RetrievedSource[];
  /** Markers the answer used that name no retrieved source. */
  invalid: number[];
};

/**
 * `[1]`, `[12]`, and the `[1][3]` run — each bracket is matched separately.
 *
 * Deliberately narrow, because a false positive here *invents* a citation.
 *
 * Digits only, so a footnote (`[^1]`) does not match.
 *
 * The *run* is matched, not each bracket, and only the run's start is checked
 * for a preceding `]`. Two attempts were needed here. Matching each bracket
 * alone read `[the docs][1]` — a markdown reference link — as a citation.
 * Rejecting any bracket preceded by `]` then broke `[1][3]`, which is the
 * documented way to cite two sources for one sentence: structurally the two
 * are identical, and only the run tells them apart.
 */
const MARKER_RUN = /(?<!\])(?:\[\d{1,3}\])+/g;
const DIGITS = /\d{1,3}/g;

export function parseCitationMarkers(
  answer: string,
  sources: readonly RetrievedSource[],
): CitationMarkers {
  const seen = new Set<number>();
  const invalid = new Set<number>();

  for (const run of answer.matchAll(MARKER_RUN)) {
    for (const digits of run[0].matchAll(DIGITS)) {
      const n = Number(digits[0]);
      if (n >= 1 && n <= sources.length) {
        seen.add(n);
      } else {
        invalid.add(n);
      }
    }
  }

  const numbers = [...seen].sort((a, b) => a - b);

  return {
    numbers,
    sources: numbers.map((n) => sources[n - 1]),
    invalid: [...invalid].sort((a, b) => a - b),
  };
}
