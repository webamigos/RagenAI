import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '../lib/corpus';
import { containsExpectation, runAssertions } from '../lib/grade';

/**
 * guard-bilingual-v1 v4: `expectNone` holds only figures that appear in no
 * document. A documented figure — the bicycle fare, the baggage fee, the
 * sibling operator's voucher validity — is what a careful refusal quotes as
 * context, and in the v1–v3 runs the substring gate failed those refusals
 * while the rubric passed them. Whether such a figure is offered *as the
 * answer* is the rubric's call; a substring cannot see the difference.
 */
const dir = join(import.meta.dirname, '..', 'corpora', 'guard-bilingual-v1');
const { corpus, questions } = loadCorpus(dir);
const documents = corpus.documents.map((d) =>
  readFileSync(join(dir, d.file), 'utf8'),
);
const byId = (id: string) => {
  const q = questions.find((x) => x.id === id);
  if (!q) {
    throw new Error(`no question ${id}`);
  }
  return q;
};

describe('guard-bilingual-v1 v4', () => {
  it('forbids no figure that a document contains', () => {
    const documented = questions.flatMap((q) =>
      (q.expectNone ?? [])
        .filter((figure) =>
          documents.some((text) => containsExpectation(text, figure)),
        )
        .map((figure) => `${q.id}: ${figure}`),
    );
    expect(documented).toEqual([]);
  });

  // Answers from the 2026-10-03 and 2026-10-04 runs that the rubric passed
  // and the v3 substring gate failed, trimmed to the sentences that matter.
  it.each([
    [
      'pl-near-w1-fare',
      'Dostarczone dokumenty nie zawierają informacji na temat ceny biletu jednorazowego dla pasażera na linii W1. W udostępnionych materiałach znajdują się jedynie informacje o cenie jednorazowego biletu za przewóz roweru, która wynosi 9,80 zł [1].',
    ],
    [
      'pl-near-delay-claim-deadline',
      'Dostarczone dokumenty nie zawierają informacji o konkretnym terminie, w jakim pasażer musi złożyć wniosek o rekompensatę. Wniosek jest rozpatrywany w terminie 21 dni roboczych [1]. W przypadku szkód bagażowych (a nie opóźnień pociągu) zgłoszenie musi nastąpić w terminie 7 dni kalendarzowych [2].',
    ],
    [
      'pl-ooc-fare-evasion',
      'Dostarczone materiały nie zawierają informacji na temat wysokości opłaty dodatkowej za przejazd bez ważnego biletu. Dokumenty określają jedynie opłaty za nadbagaż (61 zł) oraz za przewóz rowerów (9,80 zł za bilet jednorazowy) [1][3].',
    ],
    [
      'en-ooc-first-class',
      'I do not have information regarding the cost of upgrading to first class in the provided documents. The available records only specify bicycle carriage tariffs, which are EUR 3.40 for a single fare and EUR 26 for a monthly pass [1].',
    ],
    [
      'en-premise-xl-kolej-voucher',
      'The travel voucher for Kolej Nadwiślańska S.A. is worth 15% more than the cash compensation and is valid for 12 months from the date of issue [2]. The voucher worth 20% more is issued by Wolfsbane Interurban Rail and is valid for 18 months [1].',
    ],
  ])(
    '%s: a refusal quoting a documented figure clears the gate',
    (id, answer) => {
      expect(runAssertions(byId(id), answer).failures).toEqual([]);
    },
  );

  it.each([
    [
      'pl-near-delay-claim-deadline',
      'Wniosek należy złożyć w ciągu 10 dni od przejazdu.',
    ],
    [
      'en-near-xl-kolej-annual-bike-pass',
      'Twelve monthly passes at 74 zł come to 888 zł a year.',
    ],
    ['pl-premise-overweight-surcharge', 'Zapłacisz 2 × 61 zł, czyli 122 zł.'],
    ['pl-premise-absent-student', 'Bilet studencki kosztuje 19,60 zł.'],
  ])('%s: an invented figure still fails the gate', (id, answer) => {
    expect(runAssertions(byId(id), answer).passed).toBe(false);
  });
});
