import type { GuardrailStage } from '../contracts/guardrail';
import { compilePattern } from './pattern';
import { probeRegex } from './redos-probe';

/**
 * What a pattern has to survive before it can be saved.
 *
 * Two independent gates, for two different failures:
 *
 * 1. **A match wider than the output window.** Output rules run on a sliding
 *    window that holds back the last 256 characters. A pattern able to match
 *    past that has its prefix flushed before the match completes, so `BLOCK`
 *    and `MASK` never fire — a guardrail that reads as enabled on the page and
 *    is enforced by nothing. Static, cheap, and the worse of the two failures
 *    because it is silent.
 * 2. **Catastrophic backtracking.** A pattern that is fine on a short string
 *    can take longer than the heat death of the universe on a long one, and
 *    the runtime cannot rescue it: a JavaScript `RegExp` is not interruptible
 *    once it has entered a match, so the per-turn budget bounds how many rules
 *    run and nothing else. The only place it can be stopped is here, which is
 *    why it refuses rather than warns — and why it runs in a worker, because
 *    timing the call in-process measures something that never returns. See
 *    `redos-probe.ts`.
 *
 * The two are separate exports because they cost differently. The shape check
 * is synchronous and instant, so a form can run it on every keystroke; the
 * probe spawns a worker, so it belongs in the save action.
 */

/** The output funnel's sliding window, in characters. */
export const OUTPUT_WINDOW_CHARS = 256;

/** Wall-clock a fixture run may take before a pattern is refused. */
export const REDOS_BUDGET_MS = 50;

/** Length of the adversarial strings a pattern is tried against. */
export const REDOS_FIXTURE_CHARS = 10_000;

export type PatternValidationInput = {
  pattern: string;
  patternIsRegex: boolean;
  /** Which stage the rule runs at. `OUTPUT` and `BOTH` face the window. */
  stage: GuardrailStage;
};

export type PatternValidationFailure =
  | { code: 'empty' }
  | { code: 'not-a-regex'; message: string }
  | { code: 'too-slow'; budgetMs: number; fixture: string }
  | { code: 'match-width-unbounded' }
  | { code: 'match-width-over-window'; width: number; window: number };

export type PatternValidationResult =
  { ok: true } | { ok: false; failure: PatternValidationFailure };

const OK: PatternValidationResult = { ok: true };

/**
 * Strings chosen to make a backtracking engine work.
 *
 * Each is a long run that *almost* satisfies a nested quantifier: the classic
 * `(a+)+$` shape needs a tail that cannot match, so the engine tries every
 * partition of the run before giving up. Several alphabets, because a pattern
 * written for digits does not backtrack on letters.
 *
 * The length matches `MAX_USER_INPUT_LENGTH`: a pattern only has to survive
 * the longest text it can actually be handed.
 */
export function adversarialFixtures(): string[] {
  const n = REDOS_FIXTURE_CHARS;
  return [
    'a'.repeat(n) + '!',
    '1'.repeat(n) + '!',
    'ab'.repeat(n / 2) + '!',
    ' '.repeat(n) + '!',
    'a@'.repeat(n / 2) + '!',
  ];
}

/**
 * Everything that can be decided without running the pattern.
 *
 * Synchronous, so the admin form can call it as the operator types.
 */
export function validatePatternShape(
  input: PatternValidationInput,
): PatternValidationResult {
  const { pattern, patternIsRegex, stage } = input;

  if (pattern.trim().length === 0) {
    return { ok: false, failure: { code: 'empty' } };
  }

  // A literal cannot backtrack, and its match width is its own length.
  if (!patternIsRegex) {
    return validateWidth(pattern.length, stage);
  }

  const compiled = compile(pattern);
  if (!compiled.ok) {
    return { ok: false, failure: compiled.failure };
  }

  return validateWidth(maxMatchWidth(pattern), stage);
}

/**
 * The shape check, plus an actual run against the adversarial fixtures.
 *
 * This is the gate a save has to pass. It spawns one worker per fixture and
 * terminates it on the deadline, so a pattern that would never return costs
 * `REDOS_BUDGET_MS` rather than the request.
 */
export async function validatePattern(
  input: PatternValidationInput,
): Promise<PatternValidationResult> {
  const shape = validatePatternShape(input);
  if (!shape.ok || !input.patternIsRegex) {
    return shape;
  }

  const compiled = compile(input.pattern);
  /* c8 ignore next 3 — validatePatternShape already returned on this path. */
  if (!compiled.ok) {
    return { ok: false, failure: compiled.failure };
  }

  for (const fixture of adversarialFixtures()) {
    const outcome = await probeRegex({
      source: input.pattern,
      flags: compiled.flags,
      fixture,
      budgetMs: REDOS_BUDGET_MS,
    });

    if (outcome.kind === 'timed-out') {
      return {
        ok: false,
        failure: {
          code: 'too-slow',
          budgetMs: outcome.budgetMs,
          // Shown to the operator: a refusal that does not say what it was
          // tried against reads as the tool being broken.
          fixture: `${fixture.slice(0, 32)}… (${fixture.length} chars)`,
        },
      };
    }
    if (outcome.kind === 'failed') {
      return {
        ok: false,
        failure: { code: 'not-a-regex', message: outcome.message },
      };
    }
    if (outcome.elapsedMs !== null && outcome.elapsedMs >= REDOS_BUDGET_MS) {
      // The timer is armed when the parent processes the worker's `started`
      // message, and the worker begins matching before that — so a busy event
      // loop can leave a match running longer than the budget and still have
      // it report back as completed. The worker's own measurement is of the
      // match alone, so it is the verdict; the timer is only what bounds a
      // match that never returns at all.
      return {
        ok: false,
        failure: {
          code: 'too-slow',
          budgetMs: REDOS_BUDGET_MS,
          fixture: `${fixture.slice(0, 32)}… (${fixture.length} chars)`,
        },
      };
    }
  }

  return OK;
}

type CompileResult =
  | { ok: true; flags: string }
  | { ok: false; failure: { code: 'not-a-regex'; message: string } };

/**
 * Compiled exactly as the evaluator compiles it, flags included.
 *
 * This used to probe under `gu`/`g` while the evaluator ran `giu`/`gi`, which
 * made the gate miss the case it exists for: a case-sensitive probe fails fast
 * on a fixture the case-insensitive runtime backtracks through, so
 * `^(?:A+)+$` was accepted here and could hang there. Both now go through
 * `compilePattern`, which is the only place the flags are decided.
 */
function compile(pattern: string): CompileResult {
  const compiled = compilePattern(pattern);
  return compiled.ok
    ? { ok: true, flags: compiled.flags }
    : {
        ok: false,
        failure: { code: 'not-a-regex', message: compiled.message },
      };
}

function validateWidth(
  width: number | null,
  stage: GuardrailStage,
): PatternValidationResult {
  // Input is not streamed — it arrives whole, capped by MAX_USER_INPUT_LENGTH
  // — so the window only constrains a rule that can reach the output funnel.
  if (stage === 'INPUT') {
    return OK;
  }
  if (width === null) {
    return { ok: false, failure: { code: 'match-width-unbounded' } };
  }
  if (width > OUTPUT_WINDOW_CHARS) {
    return {
      ok: false,
      failure: {
        code: 'match-width-over-window',
        width,
        window: OUTPUT_WINDOW_CHARS,
      },
    };
  }
  return OK;
}

/**
 * An upper bound on how many characters this pattern can match, or `null` when
 * it can match without limit.
 *
 * Deliberately conservative and deliberately not a parser: it walks the source
 * counting what each atom can contribute, and answers `null` the moment it
 * meets an unbounded quantifier or a construct it does not model. Refusing a
 * pattern that would in fact have been fine costs an operator a rewrite;
 * accepting one that can outrun the window costs them a guardrail that does
 * nothing, and says nothing. The asymmetry decides which way to be wrong.
 */
export function maxMatchWidth(source: string): number | null {
  let total = 0;
  let lastAtomWidth = 0;
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    // Anything with its own nesting or its own semantics: stop modelling and
    // say so, rather than guess.
    if (char === '(' || char === '|') {
      return null;
    }
    if (char === '\\' && isBackreference(source, i)) {
      return null;
    }

    if (char === '\\') {
      lastAtomWidth = 1;
      total += 1;
      i += 2;
    } else if (char === '[') {
      const close = findClassEnd(source, i);
      if (close === -1) {
        return null;
      }
      lastAtomWidth = 1;
      total += 1;
      i = close + 1;
    } else if (char === '^' || char === '$') {
      // Zero-width: contributes nothing and cannot be quantified meaningfully.
      lastAtomWidth = 0;
      i += 1;
      continue;
    } else if (char === '*' || char === '+') {
      return null;
    } else if (char === '{') {
      const close = source.indexOf('}', i);
      if (close === -1) {
        // A literal brace, not a quantifier.
        lastAtomWidth = 1;
        total += 1;
        i += 1;
        continue;
      }
      const repeat = parseRepeat(source.slice(i + 1, close));
      if (repeat === null) {
        return null;
      }
      // The atom was already counted once, so add the remaining repeats.
      total += lastAtomWidth * (repeat - 1);
      i = close + 1;
      continue;
    } else if (char === '?') {
      // Optional: the atom may contribute nothing, which only lowers the bound.
      i += 1;
      continue;
    } else {
      lastAtomWidth = 1;
      total += 1;
      i += 1;
    }

    // A quantifier binding to the atom just consumed.
    const next = source[i];
    if (next === '*' || next === '+') {
      return null;
    }
    if (next === '{') {
      const close = source.indexOf('}', i);
      if (close === -1) {
        continue;
      }
      const repeat = parseRepeat(source.slice(i + 1, close));
      if (repeat === null) {
        return null;
      }
      total += lastAtomWidth * (repeat - 1);
      i = close + 1;
    } else if (next === '?') {
      i += 1;
    }
  }

  return total;
}

/** `{n}` / `{n,m}` → m. `{n,}` is unbounded, and so is anything unparseable. */
function parseRepeat(body: string): number | null {
  const exact = /^(\d+)$/.exec(body);
  if (exact) {
    return Number(exact[1]);
  }
  const range = /^(\d+),(\d+)$/.exec(body);
  if (range) {
    return Number(range[2]);
  }
  return null;
}

function findClassEnd(source: string, start: number): number {
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === '\\') {
      i += 1;
    } else if (source[i] === ']') {
      return i;
    }
  }
  return -1;
}

function isBackreference(source: string, at: number): boolean {
  const next = source[at + 1];
  return next !== undefined && /[1-9k]/.test(next);
}
