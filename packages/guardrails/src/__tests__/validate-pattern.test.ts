import { describe, expect, it } from 'vitest';

import { OUTPUT_WINDOW_CHARS } from '../contracts/guardrail';
import {
  adversarialFixtures,
  maxMatchWidth,
  REDOS_BUDGET_MS,
  REDOS_FIXTURE_CHARS,
  validatePattern,
  validatePatternShape,
} from '../evaluator/validate-pattern';

/** The synchronous half: everything decidable without running the pattern. */
const asInput = (pattern: string, patternIsRegex = true) =>
  validatePatternShape({ pattern, patternIsRegex, stage: 'INPUT' as const });

const asOutput = (pattern: string, patternIsRegex = true) =>
  validatePatternShape({ pattern, patternIsRegex, stage: 'OUTPUT' as const });

describe('the adversarial fixtures', () => {
  it('are long enough to expose backtracking', () => {
    for (const fixture of adversarialFixtures()) {
      expect(fixture.length).toBeGreaterThanOrEqual(REDOS_FIXTURE_CHARS);
    }
  });

  it('each end in a character that cannot satisfy the pattern', () => {
    // The shape that makes a backtracking engine work: a long run that almost
    // matches, then a tail that cannot, so every partition of the run is tried.
    for (const fixture of adversarialFixtures()) {
      expect(fixture.endsWith('!')).toBe(true);
    }
  });
});

describe('refusing a pattern that can backtrack catastrophically', () => {
  // These run the pattern for real, in a worker that gets terminated on the
  // deadline. Timing the call in-process cannot work: `(a+)+$` against 10 000
  // characters does not return, so there is nothing to time — the check would
  // hang on exactly the patterns it exists to catch. See redos-probe.ts.
  const probe = (pattern: string) =>
    validatePattern({ pattern, patternIsRegex: true, stage: 'INPUT' });

  it('refuses the classic nested quantifier, within the budget', async () => {
    const started = Date.now();
    const result = await probe('(a+)+$');
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('too-slow');
    }
    // The point of the worker: a pattern that would never return costs the
    // budget, not the request. Generous headroom for worker startup, because
    // the assertion is "bounded", not "fast".
    expect(elapsed).toBeLessThan(5_000);
  }, 20_000);

  it('refuses an alternation that overlaps itself under a quantifier', async () => {
    const result = await probe('(a|a)+$');

    expect(result.ok).toBe(false);
  }, 20_000);

  it('names what it was tried against, so the refusal is actionable', async () => {
    // A refusal that does not say what it tested reads as the tool being
    // broken rather than the pattern being wrong.
    const result = await probe('(a+)+$');

    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.code === 'too-slow') {
      expect(result.failure.fixture).toContain('10001 chars');
      expect(result.failure.budgetMs).toBe(REDOS_BUDGET_MS);
    }
  }, 20_000);

  it('accepts an ordinary pattern', async () => {
    await expect(probe('\\d{4}-\\d{4}')).resolves.toEqual({ ok: true });
    await expect(probe('[A-Z]{2}\\d{9}')).resolves.toEqual({ ok: true });
  }, 20_000);

  it('probes under the flags the evaluator will actually run', async () => {
    // The hole this closes. The probe compiled `gu`/`g` while the evaluator
    // ran `giu`/`gi`, so a case-sensitive probe failed fast on a fixture of
    // lowercase `a`s and passed the pattern — which then backtracked
    // catastrophically at request time, where nothing can interrupt it.
    const result = await probe('^(?:A+)+$');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('too-slow');
    }
  }, 20_000);

  it('skips the probe for a literal, which cannot backtrack', async () => {
    const result = await validatePattern({
      pattern: '(a+)+$',
      patternIsRegex: false,
      stage: 'INPUT',
    });

    // Same text, not compiled as a regex: nothing to backtrack, so this is a
    // plain substring search and must not pay for five workers.
    expect(result).toEqual({ ok: true });
  });

  it('refuses on shape before it ever starts a worker', async () => {
    const result = await validatePattern({
      pattern: 'secret.*',
      patternIsRegex: true,
      stage: 'OUTPUT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('match-width-unbounded');
    }
  });
});

describe('refusing a pattern that is not a regex at all', () => {
  it('reports the compiler’s own message', () => {
    const result = asInput('([a-z');

    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.code === 'not-a-regex') {
      expect(result.failure.message).toBeTruthy();
    }
  });

  it('refuses an empty pattern', () => {
    expect(asInput('').ok).toBe(false);
    expect(asInput('   ', false).ok).toBe(false);
  });
});

describe('the output window', () => {
  it('refuses an unbounded pattern on an output rule', () => {
    // The silent failure this exists for: the prefix is flushed before the
    // match completes, so BLOCK and MASK never fire while the page shows the
    // rule as enabled.
    const result = asOutput('secret.*');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('match-width-unbounded');
    }
  });

  it('refuses a bounded pattern that is still wider than the window', () => {
    const result = asOutput('.{300}');

    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.code === 'match-width-over-window') {
      expect(result.failure.width).toBeGreaterThan(OUTPUT_WINDOW_CHARS);
      expect(result.failure.window).toBe(OUTPUT_WINDOW_CHARS);
    }
  });

  it('accepts a pattern that fits', () => {
    expect(asOutput('\\d{16}').ok).toBe(true);
    expect(asOutput('card', false).ok).toBe(true);
  });

  it('applies the same rule to BOTH, which carries an output half', () => {
    const result = validatePatternShape({
      pattern: 'secret.*',
      patternIsRegex: true,
      stage: 'BOTH',
    });

    expect(result.ok).toBe(false);
  });

  it('does not apply it to an input rule, which is not streamed', () => {
    // Input arrives whole, capped by MAX_USER_INPUT_LENGTH, so there is no
    // window to outrun.
    expect(asInput('secret.*').ok).toBe(true);
  });

  it('refuses a literal longer than the window on output', () => {
    expect(asOutput('x'.repeat(OUTPUT_WINDOW_CHARS + 1), false).ok).toBe(false);
    expect(asOutput('x'.repeat(OUTPUT_WINDOW_CHARS), false).ok).toBe(true);
  });
});

describe('estimating the widest possible match', () => {
  it('counts literals', () => {
    expect(maxMatchWidth('abc')).toBe(3);
  });

  it('counts a character class as one character', () => {
    expect(maxMatchWidth('[abc]')).toBe(1);
    expect(maxMatchWidth('[a-z][0-9]')).toBe(2);
  });

  it('counts an escape as one character', () => {
    expect(maxMatchWidth('\\d\\d')).toBe(2);
  });

  it('takes the upper bound of a repeat', () => {
    expect(maxMatchWidth('a{5}')).toBe(5);
    expect(maxMatchWidth('a{2,7}')).toBe(7);
    expect(maxMatchWidth('[0-9]{16}')).toBe(16);
  });

  it('ignores anchors, which match no characters', () => {
    expect(maxMatchWidth('^ab$')).toBe(2);
  });

  it.each(['a*', 'a+', 'a{2,}', '\\d*', '[a-z]+'])(
    'answers unbounded for %s',
    (pattern) => {
      expect(maxMatchWidth(pattern)).toBeNull();
    },
  );

  it('answers unbounded for a group, rather than guessing at nesting', () => {
    // Being wrong in this direction costs an operator a rewrite. Being wrong
    // the other way costs them a guardrail that does nothing and says nothing.
    expect(maxMatchWidth('(ab)')).toBeNull();
    expect(maxMatchWidth('a|b')).toBeNull();
    expect(maxMatchWidth('(a)\\1')).toBeNull();
  });

  it('answers unbounded for an unterminated class', () => {
    expect(maxMatchWidth('[a-z')).toBeNull();
  });

  it('does not count an optional atom as more than it can be', () => {
    expect(maxMatchWidth('ab?c')).toBeLessThanOrEqual(3);
  });
});
