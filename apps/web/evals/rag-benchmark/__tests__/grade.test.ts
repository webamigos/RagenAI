import { describe, it, expect } from 'vitest';
import {
  normalizeForMatch,
  normalizeNumbers,
  normalizeDigits,
  containsExpectation,
  runAssertions,
  parseJudgeVerdict,
} from '../lib/grade';
import type { Question } from '../lib/types';

const question = (overrides: Partial<Question>): Question => ({
  id: 'q',
  lang: 'pl',
  docLang: 'pl',
  type: 'numeric',
  question: 'q?',
  ...overrides,
});

describe('normalizeForMatch', () => {
  it('folds NBSP and the narrow NBSP into an ordinary space', () => {
    expect(normalizeForMatch('4 180 000')).toBe('4 180 000');
  });

  it('lowercases and trims', () => {
    expect(normalizeForMatch('  Zwrot 87%  ')).toBe('zwrot 87%');
  });
});

describe('normalizeNumbers', () => {
  it('removes spacing inside a number', () => {
    expect(normalizeNumbers('4 180 000 zł')).toBe('4180000 zł');
  });

  it('folds a decimal comma to a dot', () => {
    expect(normalizeNumbers('249,50 zł')).toBe('249.50 zł');
  });

  it('leaves a space that separates a number from a word', () => {
    // Not "14dni": only a space between two digits is intra-number.
    expect(normalizeNumbers('14 dni roboczych')).toBe('14 dni roboczych');
  });
});

describe('normalizeDigits', () => {
  it('removes a comma used as a thousands separator', () => {
    expect(normalizeDigits('EUR 2,740,000')).toBe('eur 2740000');
  });

  it('removes a space used as a thousands separator', () => {
    expect(normalizeDigits('2 740 000')).toBe('2740000');
  });

  it('leaves a comma that separates words', () => {
    expect(normalizeDigits('87%, and 62%')).toBe('87%, and 62%');
  });
});

describe('containsExpectation', () => {
  // The corpus is bilingual, so the same figure arrives as "2 740 000" from a
  // Polish document and "2,740,000" from an English answer. This failed a
  // real case while the judge confirmed the figure was correct.
  it('matches a figure across locale thousands separators', () => {
    expect(
      containsExpectation('The budget is EUR 2,740,000.', '2 740 000'),
    ).toBe(true);
    expect(containsExpectation('Budżet to 2 740 000 EUR.', '2,740,000')).toBe(
      true,
    );
  });

  it('matches a figure written with different thousands spacing', () => {
    expect(containsExpectation('Budżet to 4180000 zł.', '4 180 000')).toBe(
      true,
    );
    expect(containsExpectation('Budżet to 4 180 000 zł.', '4180000')).toBe(
      true,
    );
  });

  it('matches across a decimal separator difference', () => {
    expect(containsExpectation('Próg wynosi 249.50 zł', '249,50')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(containsExpectation('31 OCTOBER 2026', '31 October 2026')).toBe(
      true,
    );
  });

  it('does not match an absent figure', () => {
    expect(containsExpectation('Zwrot wynosi 87%.', '62')).toBe(false);
  });
});

describe('runAssertions', () => {
  it('passes when every expectation is present and no distractor is', () => {
    const outcome = runAssertions(
      question({ expectAll: ['87'], expectNone: ['62'] }),
      'Zwrot wynosi 87% ceny biletu.',
    );
    expect(outcome).toEqual({ passed: true, failures: [] });
  });

  it('reports a missing expectation', () => {
    const outcome = runAssertions(question({ expectAll: ['87'] }), 'Nie wiem.');
    expect(outcome.passed).toBe(false);
    expect(outcome.failures).toEqual(['missing: "87"']);
  });

  // The distractor gate is the reason the corpus has two parallel document
  // sets: an answer of the right shape drawn from the wrong document.
  it('fails when the answer carries another document’s figure', () => {
    const outcome = runAssertions(
      question({ expectAll: ['87'], expectNone: ['62'] }),
      'Zwrot wynosi 87%, a w innym regulaminie 62%.',
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.failures).toEqual(['must not contain: "62"']);
  });

  it('treats expectAny as satisfied by one hit', () => {
    const outcome = runAssertions(
      question({ expectAny: ['87%', 'osiemdziesiąt siedem'] }),
      'Zwrot to osiemdziesiąt siedem procent.',
    );
    expect(outcome.passed).toBe(true);
  });

  it('reports every variant when expectAny finds none', () => {
    const outcome = runAssertions(
      question({ expectAny: ['87%', '87 procent'] }),
      'Nie wiem.',
    );
    expect(outcome.failures).toEqual(['none of: 87% | 87 procent']);
  });
});

describe('parseJudgeVerdict', () => {
  it('reads a bare JSON verdict', () => {
    expect(parseJudgeVerdict('{"pass": true, "reason": "states 87%"}')).toEqual(
      {
        pass: true,
        reason: 'states 87%',
      },
    );
  });

  it('reads a verdict wrapped in a fenced block', () => {
    const raw = '```json\n{"pass": false, "reason": "wrong figure"}\n```';
    expect(parseJudgeVerdict(raw)).toEqual({
      pass: false,
      reason: 'wrong figure',
    });
  });

  it('leaves `error` unset on a verdict it could read', () => {
    expect(parseJudgeVerdict('{"pass": false, "reason": "no"}').error).toBe(
      undefined,
    );
  });

  // One unreadable verdict should cost one case, not the whole run — and it
  // should cost it as an *ungraded* case, not as a rubric the answer failed.
  // Scoring it `false` would let a judge having a bad minute read as a quality
  // regression in the published rate.
  it('marks a missing JSON verdict as a judge error rather than throwing', () => {
    const verdict = parseJudgeVerdict('I think it looks fine.');
    expect(verdict.error).toBe('judge returned no JSON');
    expect(verdict.reason).toContain('no JSON');
  });

  it('marks malformed JSON as a judge error', () => {
    const verdict = parseJudgeVerdict('{"pass": true, "reason": }');
    expect(verdict.error).toBe('judge returned unparseable JSON');
    expect(verdict.reason).toContain('unparseable');
  });

  it('marks a non-boolean pass as a judge error, not a failed rubric', () => {
    const verdict = parseJudgeVerdict('{"pass": "yes"}');
    expect(verdict.error).toBe('judge verdict has no boolean "pass"');
    expect(verdict.pass).toBe(false);
  });
});
