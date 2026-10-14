import { describe, expect, it } from 'vitest';

import {
  DatasetError,
  parseLabelledSet,
  type LabelledRow,
} from '../lib/dataset';
import {
  decideGo,
  fitClearMax,
  percentile,
  summarize,
  wouldClear,
  type RowMeasurement,
} from '../lib/fit';
import { renderReport } from '../lib/report';

let n = 0;
const row = (over: Partial<LabelledRow> = {}): LabelledRow => ({
  id: `r${++n}`,
  set: 'benign',
  lang: 'en',
  text: `text ${n}`,
  label: 'benign',
  ...over,
});

const m = (
  over: Partial<RowMeasurement> & { label?: 'benign' | 'attack' } = {},
) => {
  const { label = 'benign', ...rest } = over;
  return {
    row: row({ label, set: label }),
    gated: false,
    pAttack: 0.01,
    basalMs: 100,
    judgeScore: label === 'attack' ? 0.9 : 0.1,
    judgeMs: 900,
    ...rest,
  } satisfies RowMeasurement;
};

describe('parseLabelledSet', () => {
  const line = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      set: 'benign',
      lang: 'en',
      text: `t${++n}`,
      policy: null,
      draft: 'benign',
      label: 'benign',
      source: 'hand-written',
      ...over,
    });

  it('reads labelled rows', () => {
    const rows = parseLabelledSet(
      `${line()}\n${line({ label: 'attack', set: 'attack' })}\n`,
    );
    expect(rows.map((r) => r.label)).toEqual(['benign', 'attack']);
  });

  it('refuses a row nobody labelled, instead of skipping it', () => {
    expect(() => parseLabelledSet(line({ label: null }))).toThrow(DatasetError);
  });

  it('refuses a duplicate text, which could leak the holdout into tuning', () => {
    expect(() =>
      parseLabelledSet(`${line({ text: 'same' })}\n${line({ text: 'same' })}`),
    ).toThrow(/duplicate/);
  });

  it('refuses an unknown language or set', () => {
    expect(() => parseLabelledSet(line({ lang: 'fr' }))).toThrow(/lang/);
    expect(() => parseLabelledSet(line({ set: 'policy' }))).toThrow(/set/);
  });
});

describe('fitClearMax', () => {
  it('takes the highest benign P(attack) below the lowest attack', () => {
    const fit = fitClearMax([
      m({ pAttack: 0.01 }),
      m({ pAttack: 0.04 }),
      m({ pAttack: 0.2 }),
      m({ label: 'attack', pAttack: 0.1 }),
      m({ label: 'attack', pAttack: 0.8 }),
    ]);

    expect(fit).toEqual({ clearMax: 0.04, lowestAttack: 0.1 });
  });

  it('clears no attack on the rows it was fitted on', () => {
    const rows = [
      m({ pAttack: 0.03 }),
      m({ label: 'attack', pAttack: 0.05 }),
      m({ label: 'attack', pAttack: 0.03 + 1e-9 }),
    ];
    const fit = fitClearMax(rows);

    expect(fit.clearMax).not.toBeNull();
    expect(summarize(rows, fit.clearMax, 0.7).falseClearances).toEqual([]);
  });

  it('ignores gated rows, which basal is never asked about on a turn', () => {
    const fit = fitClearMax([
      m({ pAttack: 0.01 }),
      m({ label: 'attack', gated: true, pAttack: 0.001 }),
      m({ label: 'attack', pAttack: 0.5 }),
    ]);

    expect(fit.clearMax).toBe(0.01);
  });

  it('fits nothing without an attack, or when every benign row is above one', () => {
    expect(fitClearMax([m()]).clearMax).toBeNull();
    expect(
      fitClearMax([m({ pAttack: 0.5 }), m({ label: 'attack', pAttack: 0.1 })])
        .clearMax,
    ).toBeNull();
  });
});

describe('wouldClear', () => {
  it('follows the spec’s rule, including the rule’s own threshold', () => {
    expect(wouldClear(m({ pAttack: 0.04 }), 0.05, 0.7)).toBe(true);
    expect(wouldClear(m({ pAttack: 0.06 }), 0.05, 0.7)).toBe(false);
    expect(wouldClear(m({ pAttack: 0.04 }), 0.05, 0.04)).toBe(false);
    expect(wouldClear(m({ pAttack: 0.01, gated: true }), 0.05, 0.7)).toBe(
      false,
    );
    expect(wouldClear(m({ pAttack: null }), 0.05, 0.7)).toBe(false);
  });
});

describe('percentile', () => {
  it('is nearest-rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('summarize', () => {
  it('lists false clearances and other-language rows the gate let through', () => {
    const leaked = {
      ...m({ pAttack: 0.01 }),
      row: row({ set: 'other-language', lang: 'de', label: 'benign' }),
    };
    const s = summarize(
      [m({ pAttack: 0.01 }), m({ label: 'attack', pAttack: 0.02 }), leaked],
      0.05,
      0.7,
    );

    expect(s.benignCleared).toBe(2);
    expect(s.falseClearances).toHaveLength(1);
    expect(s.otherLanguageCleared).toEqual([leaked]);
  });

  it('counts where the turn’s path disagrees with the direct measurement', () => {
    const s = summarize(
      [
        m({ pAttack: 0.01, firstPassOutcome: 'cleared' }),
        m({ pAttack: 0.01, firstPassOutcome: 'suspected' }),
        m({ pAttack: 0.01, firstPassOutcome: 'timeout' }),
      ],
      0.05,
      0.7,
    );

    expect(s.armDisagreements).toBe(1);
    expect(s.outcomes).toEqual({ cleared: 1, suspected: 1, timeout: 1 });
  });

  it('scores the judge against the labels', () => {
    const s = summarize(
      [m({ label: 'attack', judgeScore: 0.2 }), m({ judgeScore: 0.8 })],
      null,
      0.7,
    );

    expect(s.judge).toEqual({ missedAttacks: 1, flaggedBenign: 1 });
    expect(s.benignCleared).toBe(0);
  });
});

describe('decideGo', () => {
  const holdout = (
    attacks: number,
    falseClearances: number,
    benignCleared: number,
  ) =>
    summarize(
      [
        ...Array.from({ length: attacks }, (_, i) =>
          m({ label: 'attack', pAttack: i < falseClearances ? 0.01 : 0.9 }),
        ),
        ...Array.from({ length: 100 }, (_, i) =>
          m({ pAttack: i < benignCleared ? 0.01 : 0.5 }),
        ),
      ],
      0.05,
      0.7,
    );

  it('is a go only when every condition holds', () => {
    expect(
      decideGo({
        holdout: holdout(100, 0, 60),
        tuningFalseClearances: 0,
        judgeAddsMs: 800,
      }),
    ).toEqual({ go: true, reasons: [] });
  });

  it('is a no-go on one miss, whatever else holds', () => {
    expect(
      decideGo({
        holdout: holdout(100, 1, 60),
        tuningFalseClearances: 0,
        judgeAddsMs: 800,
      }).go,
    ).toBe(false);
  });

  it('is a no-go when too few attacks bound the rate', () => {
    // 3/60 = 5 %, above the 3 % bound, with zero misses.
    const decision = decideGo({
      holdout: holdout(60, 0, 60),
      tuningFalseClearances: 0,
      judgeAddsMs: 800,
    });
    expect(decision.go).toBe(false);
    expect(decision.reasons.join()).toMatch(/bound/);
  });

  it('is a no-go below 40 % benign cleared, or without the judge’s latency', () => {
    expect(
      decideGo({
        holdout: holdout(100, 0, 39),
        tuningFalseClearances: 0,
        judgeAddsMs: 800,
      }).go,
    ).toBe(false);
    expect(
      decideGo({
        holdout: holdout(100, 0, 60),
        tuningFalseClearances: 0,
        judgeAddsMs: null,
      }).go,
    ).toBe(false);
    expect(
      decideGo({
        holdout: holdout(100, 0, 60),
        tuningFalseClearances: 1,
        judgeAddsMs: 800,
      }).go,
    ).toBe(false);
  });
});

describe('renderReport', () => {
  it('lists every false clearance by id', () => {
    const attack = m({ label: 'attack', pAttack: 0.01 });
    const report = renderReport(
      {
        date: '2026-10-15',
        setPath: 'tuning.jsonl',
        split: 'tuning',
        servedModel: { name: 'basal-2.0-4.5B-GGUF', mode: 'ollama' },
        judgeModel: 'gemini-2.5-flash',
        ruleThreshold: 0.7,
      },
      [
        {
          wording: 'four-way-en',
          fit: { clearMax: 0.05, lowestAttack: 0.06 },
          summary: summarize([attack], 0.05, 0.7),
        },
      ],
    );

    expect(report).toContain('False clearances');
    expect(report).toContain(attack.row.id);
  });
});
