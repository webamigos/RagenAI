import type { JudgedContradiction } from '@ragenai/brain-core';

import { languageOf } from './brain-eval-metrics.js';
import type { ContradictionCase } from './fixtures/brain-contradiction-cases.js';

/** Source ids the eval gives passages: side A counts from 1, side B from 1001. */
export const B_OFFSET = 1000;

export type CaseResult = {
  name: string;
  expected: number;
  /** Items reported that match an expected pair. */
  hits: number;
  /** Items reported that do not. */
  extra: number;
  failed: boolean;
  /** Explanations detected in the other language than the passages'. */
  wrongLanguage: number;
  explanations: number;
};

export function scoreCase(
  c: ContradictionCase,
  reported: ReadonlyArray<JudgedContradiction> | null,
): CaseResult {
  if (reported === null) {
    return {
      name: c.name,
      expected: c.expected.length,
      hits: 0,
      extra: 0,
      failed: true,
      wrongLanguage: 0,
      explanations: 0,
    };
  }
  let wrongLanguage = 0;
  for (const item of reported) {
    const detected = languageOf(item.explanation);
    if (c.language !== null && detected !== null && detected !== c.language) {
      wrongLanguage += 1;
    }
  }
  const want = new Set(c.expected.map(([a, b]) => `${a}:${b + B_OFFSET}`));
  let hits = 0;
  let extra = 0;
  for (const item of reported) {
    if (want.has(`${item.aSourceId}:${item.bSourceId}`)) {
      hits += 1;
    } else {
      extra += 1;
    }
  }
  return {
    name: c.name,
    expected: c.expected.length,
    hits,
    extra,
    failed: false,
    wrongLanguage,
    explanations: reported.length,
  };
}

export type ContradictionSummary = {
  runs: number;
  failed: number;
  /** Positive cases in which the expected contradiction was reported. */
  recall: number | null;
  /** Negative cases in which anything was reported — the cost of noise. */
  falseAlarmRate: number | null;
  /** Of every item reported, the share that was expected. */
  precision: number | null;
  /** Explanations in the other language than their passages'. */
  wrongLanguageRate: number | null;
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function summarizeCases(
  results: ReadonlyArray<CaseResult>,
): ContradictionSummary {
  const judged = results.filter((r) => !r.failed);
  const positives = judged.filter((r) => r.expected > 0);
  const negatives = judged.filter((r) => r.expected === 0);
  const hits = judged.reduce((n, r) => n + r.hits, 0);
  const reported = judged.reduce((n, r) => n + r.hits + r.extra, 0);
  return {
    runs: results.length,
    failed: results.length - judged.length,
    recall: ratio(
      positives.filter((r) => r.hits >= r.expected).length,
      positives.length,
    ),
    falseAlarmRate: ratio(
      negatives.filter((r) => r.extra > 0).length,
      negatives.length,
    ),
    precision: ratio(hits, reported),
    wrongLanguageRate: ratio(
      judged.reduce((n, r) => n + r.wrongLanguage, 0),
      judged.reduce((n, r) => n + r.explanations, 0),
    ),
  };
}
