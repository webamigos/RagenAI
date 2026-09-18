import { describe, expect, it } from 'vitest';

import type { GuardrailRule } from '../contracts/guardrail';
import {
  applyMask,
  DEFAULT_PATTERN_BUDGET_MS,
  evaluatePattern,
  maskLabelFor,
  maskPlaceholder,
  mergeSpans,
  runPatternRules,
} from '../evaluator/pattern';

function rule(overrides: Partial<GuardrailRule> = {}): GuardrailRule {
  return {
    publicId: 'rule-1',
    organizationId: null,
    key: null,
    name: 'A rule',
    kind: 'PATTERN',
    stage: 'INPUT',
    action: 'MASK',
    enabled: true,
    severity: 'warn',
    ...overrides,
  };
}

describe('matching a literal', () => {
  it('finds every occurrence', () => {
    const spans = evaluatePattern(
      rule({ pattern: 'secret' }),
      'a secret secret',
    );

    expect(spans).toEqual([
      { start: 2, end: 8 },
      { start: 9, end: 15 },
    ]);
  });

  it('ignores case, because a literal names a thing rather than a spelling', () => {
    const spans = evaluatePattern(
      rule({ pattern: 'confidential' }),
      'CONFIDENTIAL',
    );

    expect(spans).toEqual([{ start: 0, end: 12 }]);
  });

  it('treats regex metacharacters literally when the rule is not a regex', () => {
    // The distinction the `patternIsRegex` column exists for: an operator
    // typing `a.b` means `a.b`, not "a, anything, b".
    expect(evaluatePattern(rule({ pattern: 'a.b' }), 'axb')).toEqual([]);
    expect(evaluatePattern(rule({ pattern: 'a.b' }), 'a.b')).toEqual([
      { start: 0, end: 3 },
    ]);
  });

  it('returns nothing for an empty or missing pattern', () => {
    expect(evaluatePattern(rule({ pattern: '' }), 'text')).toEqual([]);
    expect(evaluatePattern(rule({ pattern: null }), 'text')).toEqual([]);
  });
});

describe('matching a regex', () => {
  const regexRule = (pattern: string) =>
    rule({ pattern, patternIsRegex: true });

  it('finds every match', () => {
    const spans = evaluatePattern(regexRule('\\d{4}'), 'a 1234 b 5678');

    expect(spans).toEqual([
      { start: 2, end: 6 },
      { start: 9, end: 13 },
    ]);
  });

  it('does not hang on a pattern that can match nothing', () => {
    // A zero-width match leaves lastIndex where it is; without the manual
    // advance this spins forever, which is a denial of service written by the
    // operator rather than at them.
    const spans = evaluatePattern(regexRule('x*'), 'abc');

    expect(spans).toEqual([]);
  });

  it('returns nothing rather than throwing on a pattern that will not compile', () => {
    expect(evaluatePattern(regexRule('([a-z'), 'abc')).toEqual([]);
  });

  it('still runs a pattern that is only legal without the unicode flag', () => {
    // `\d+` inside a class with a stray escape is legal under `gi` and refused
    // under `gu`. A rule saved before this evaluator existed should keep
    // working rather than silently match nothing.
    const spans = evaluatePattern(regexRule('\\-[0-9]'), 'x-5');

    expect(spans).toEqual([{ start: 1, end: 3 }]);
  });
});

describe('merging spans', () => {
  it('collapses overlapping and touching regions', () => {
    expect(
      mergeSpans([
        { start: 0, end: 5 },
        { start: 3, end: 8 },
        { start: 8, end: 10 },
        { start: 20, end: 22 },
      ]),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 22 },
    ]);
  });

  it('is stable regardless of input order', () => {
    const merged = mergeSpans([
      { start: 20, end: 22 },
      { start: 3, end: 8 },
      { start: 0, end: 5 },
    ]);

    expect(merged).toEqual([
      { start: 0, end: 8 },
      { start: 20, end: 22 },
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(mergeSpans([])).toEqual([]);
  });
});

describe('masking', () => {
  it('uses a vocabulary Presidio’s unmasker cannot mistake for its own', () => {
    // StreamUnmasker walks the same buffer for `<TYPE_n>` alias tokens. A
    // guardrail placeholder it took for one would be "restored" to a value
    // that never existed.
    const placeholder = maskPlaceholder('credit-card');

    expect(placeholder).toBe('[[redacted:credit-card]]');
    expect(placeholder).not.toMatch(/<[A-Z_]+_\d+>/);
  });

  it('labels a built-in by its key and an operator’s rule by a slug', () => {
    expect(maskLabelFor(rule({ key: 'content-moderation' }))).toBe(
      'content-moderation',
    );
    expect(maskLabelFor(rule({ name: 'Card numbers!' }))).toBe('card-numbers');
  });

  it('never lets a rule name produce a placeholder that reads as something else', () => {
    expect(maskLabelFor(rule({ name: ']] injected [[' }))).toBe('injected');
    expect(maskLabelFor(rule({ name: '***' }))).toBe('rule');
  });

  it('replaces a single span', () => {
    const masked = applyMask('my card is 4111', [
      { rule: rule({ name: 'card' }), spans: [{ start: 11, end: 15 }] },
    ]);

    expect(masked).toBe('my card is [[redacted:card]]');
  });

  it('replaces right to left, so earlier offsets stay valid', () => {
    // The bug this prevents: replacing left to right shifts every later span
    // by the length difference, so the second placeholder lands mid-word.
    const masked = applyMask('aaa bbb ccc', [
      {
        rule: rule({ name: 'x' }),
        spans: [
          { start: 0, end: 3 },
          { start: 8, end: 11 },
        ],
      },
    ]);

    expect(masked).toBe('[[redacted:x]] bbb [[redacted:x]]');
  });

  it('masks overlapping spans once rather than nesting placeholders', () => {
    const masked = applyMask('abcdefgh', [
      { rule: rule({ name: 'a' }), spans: [{ start: 0, end: 5 }] },
      { rule: rule({ name: 'b' }), spans: [{ start: 3, end: 8 }] },
    ]);

    expect(masked).toBe('[[redacted:a]]');
    // One region, one placeholder. Replacing the two spans independently
    // produces `[[redacted:a]]edacted:b]]`, which is the symptom this counts.
    expect(masked.match(/redacted/g)).toHaveLength(1);
  });

  it('leaves the text alone when nothing matched', () => {
    expect(applyMask('untouched', [])).toBe('untouched');
  });
});

describe('the per-turn budget', () => {
  const patternRule = (id: string) =>
    rule({ publicId: id, pattern: 'x', patternIsRegex: false });

  it('runs every rule when there is time', () => {
    const result = runPatternRules([patternRule('a'), patternRule('b')], 'xx', {
      now: () => 0,
    });

    expect(result.hits).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  it('skips the remaining rules once the budget is gone, and names them', () => {
    // A rule that did not run is a rule that protected nothing. Reporting it
    // is what lets the caller log the gap instead of reporting a clean turn.
    let clock = 0;
    const result = runPatternRules(
      [patternRule('a'), patternRule('b'), patternRule('c')],
      'xxx',
      {
        budgetMs: 10,
        now: () => {
          const value = clock;
          clock += 6;
          return value;
        },
      },
    );

    expect(result.skipped.map((r) => r.publicId)).toEqual(['b', 'c']);
  });

  it('checks the budget between rules, never inside one', () => {
    // The property that matters and cannot be tested by timing: a JavaScript
    // RegExp is not interruptible once it has entered a match, so a budget can
    // only ever bound how many patterns run. If this ever starts claiming to
    // bound a single match, the save-time validator has been weakened on a
    // false promise.
    let calls = 0;
    runPatternRules([patternRule('a'), patternRule('b')], 'xx', {
      now: () => {
        calls += 1;
        return 0;
      },
    });

    // One read to start the clock, one per rule, one to report elapsed.
    expect(calls).toBe(4);
  });

  it('has a default budget small enough to only catch misbehaviour', () => {
    expect(DEFAULT_PATTERN_BUDGET_MS).toBeLessThanOrEqual(50);
  });
});
