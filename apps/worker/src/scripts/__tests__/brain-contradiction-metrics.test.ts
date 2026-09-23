import { describe, expect, it } from 'vitest';

import {
  B_OFFSET,
  scoreCase,
  summarizeCases,
} from '../brain-contradiction-metrics.js';
import { CONTRADICTION_CASES } from '../fixtures/brain-contradiction-cases.js';

const item = (a: number, b: number, explanation = 'x') => ({
  aSourceId: a,
  bSourceId: b + B_OFFSET,
  explanation,
});
const positive = {
  name: 'p',
  language: 'pl' as const,
  a: ['x'],
  b: ['y'],
  expected: [[1, 1]] as [number, number][],
};
const negative = {
  name: 'n',
  language: 'pl' as const,
  a: ['x'],
  b: ['y'],
  expected: [],
};

describe('scoreCase', () => {
  it('counts an expected pair as a hit and anything else as extra', () => {
    expect(scoreCase(positive, [item(1, 1), item(1, 2)])).toMatchObject({
      hits: 1,
      extra: 1,
      failed: false,
    });
  });

  it('counts an explanation in the other language than the passages', () => {
    expect(
      scoreCase(positive, [
        item(1, 1, 'Page A states 26 days, while page B states 20 days.'),
        item(
          1,
          2,
          'Według strony A przysługuje 26 dni, natomiast według strony B 20 dni.',
        ),
      ]),
    ).toMatchObject({ wrongLanguage: 1, explanations: 2 });
  });

  it('does not judge the language of a mixed-language pair', () => {
    expect(
      scoreCase({ ...positive, language: null }, [
        item(1, 1, 'Page A states 26 days, while page B states 20 days.'),
      ]).wrongLanguage,
    ).toBe(0);
  });

  it('marks a judgement that failed', () => {
    expect(scoreCase(positive, null)).toMatchObject({ failed: true });
  });
});

describe('summarizeCases', () => {
  it('turns case results into recall, false alarms and precision', () => {
    const summary = summarizeCases([
      scoreCase(positive, [item(1, 1)]),
      scoreCase(positive, []),
      scoreCase(negative, [item(1, 1)]),
      scoreCase(negative, []),
      scoreCase(negative, null),
    ]);
    expect(summary).toEqual({
      runs: 5,
      failed: 1,
      recall: 0.5,
      falseAlarmRate: 0.5,
      precision: 0.5,
      wrongLanguageRate: 0,
    });
  });
});

describe('the fixture', () => {
  it('names only passages that exist, and has both kinds of case', () => {
    for (const c of CONTRADICTION_CASES) {
      for (const [a, b] of c.expected) {
        expect(a).toBeGreaterThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(c.a.length);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(c.b.length);
      }
    }
    expect(CONTRADICTION_CASES.some((c) => c.expected.length === 0)).toBe(true);
    expect(CONTRADICTION_CASES.some((c) => c.expected.length > 0)).toBe(true);
    expect(new Set(CONTRADICTION_CASES.map((c) => c.name)).size).toBe(
      CONTRADICTION_CASES.length,
    );
  });
});
