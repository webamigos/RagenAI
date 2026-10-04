import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '../lib/corpus';
import { runAssertions } from '../lib/grade';

/**
 * kolej-bilingual-v1 v3: answers the v2 substring gate failed while the
 * rubric passed them — taken from the 2026-10-03 B1 and C1 runs. Each must now
 * clear the deterministic gate, which leaves the judgement to the rubric; the
 * positive gates must still catch a wrong answer.
 */
const { questions } = loadCorpus(
  join(import.meta.dirname, '..', 'corpora', 'kolej-bilingual-v1'),
);
const byId = (id: string) => {
  const q = questions.find((x) => x.id === id);
  if (!q) {
    throw new Error(`no question ${id}`);
  }
  return q;
};

describe('kolej-bilingual-v1 v3 — the v2 false negatives', () => {
  it.each([
    [
      'pl-mono-refund-deadline',
      'Wniosek o zwrot rozpatrywany jest w terminie 14 dni roboczych [1]. Termin ten różni się od terminu dla rekompensat za opóźnienia, który wynosi 21 dni roboczych [2].',
    ],
    [
      'en-mono-refund-deadline',
      'A refund request is decided within 9 business days [1]. Compensation requests for delays have a longer processing time of 16 business days [3].',
    ],
    [
      'pl-mono-guard-hallucination',
      'Dokumenty nie zawierają informacji o opłacie za przewóz psa. Wspominają jedynie o opłatach za nadbagaż (61 zł) oraz o taryfie dla rowerów (9,80 zł) [1][2].',
    ],
    [
      'en-mono-guard-hallucination',
      'The documents do not cover a fee for transporting a dog. Additional baggage items cost EUR 44 each, but pets are not mentioned [1].',
    ],
    [
      'en-mono-multihop-cockatrice',
      'The budget is EUR 2,740,000 [1]. The first stage is scheduled to be completed by October 31, 2026 [1].',
    ],
  ])('%s: a correct answer clears the substring gate', (id, answer) => {
    expect(runAssertions(byId(id), answer).failures).toEqual([]);
  });

  it('still requires the right figure', () => {
    expect(
      runAssertions(
        byId('pl-mono-refund-deadline'),
        'Wniosek rozpatrywany jest w 21 dni.',
      ).passed,
    ).toBe(false);
    expect(
      runAssertions(
        byId('en-mono-multihop-cockatrice'),
        'The budget is EUR 2,740,000; the date is not given.',
      ).passed,
    ).toBe(false);
  });
});
