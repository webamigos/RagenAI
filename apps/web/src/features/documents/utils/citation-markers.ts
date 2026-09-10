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
 * The *run* is matched, not each bracket, and only its ends are checked.
 * Everything ruled out here is markdown the model can legitimately write, and
 * each was a real false positive rather than a hypothetical:
 *
 * - `[the docs][1]` — a reference link. Rejected by the preceding `]`.
 *   Matching each bracket separately read it as a citation.
 * - `[1](url)` — an inline link, and `[1]: url` a reference definition.
 *   Rejected by the following `(` or `:`.
 * - `![1](img)` — an image. Rejected by the preceding `!`.
 *
 * The run is what makes the first rule survivable: `[1][3]` is the documented
 * way to cite two sources for one sentence, and by "preceded by `]`" alone it
 * is indistinguishable from a reference link. Matching the whole run and
 * testing only its ends separates them.
 */
const MARKER_RUN = /(?<![\]!])(?:\[\d+\])+(?![(:])/g;
const DIGITS = /\d+/g;

/**
 * Every number the answer used as a citation marker, valid or not.
 *
 * Exported because the RAG eval needs the same answer to a different
 * question — "did the model invent a source?" — and a second copy of this
 * pattern in `evals/e2e-rag/run.ts` had already drifted: it kept a
 * three-digit cap this one has dropped, so `[1000]` was silently not a
 * marker there and the case it guards passed on a fabricated citation.
 *
 * No cap on digits. A number too large to name a source is still a marker
 * the model wrote, and calling it "not a marker" is how it goes unreported.
 */
export function extractMarkerNumbers(answer: string): number[] {
  const numbers: number[] = [];
  for (const run of answer.matchAll(MARKER_RUN)) {
    for (const digits of run[0].matchAll(DIGITS)) {
      numbers.push(Number(digits[0]));
    }
  }
  return numbers;
}

export function parseCitationMarkers(
  answer: string,
  sources: readonly RetrievedSource[],
): CitationMarkers {
  const seen = new Set<number>();
  const invalid = new Set<number>();

  for (const n of extractMarkerNumbers(answer)) {
    if (n >= 1 && n <= sources.length) {
      seen.add(n);
    } else {
      invalid.add(n);
    }
  }

  const numbers = [...seen].sort((a, b) => a - b);

  return {
    numbers,
    sources: numbers.map((n) => sources[n - 1]),
    invalid: [...invalid].sort((a, b) => a - b),
  };
}
