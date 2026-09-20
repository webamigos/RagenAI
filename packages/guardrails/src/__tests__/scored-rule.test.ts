import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_GUARDRAIL_KEYS,
  isScoredRule,
  SCORED_BUILT_IN_KEYS,
  type GuardrailRule,
} from '../contracts/guardrail';
import { isJudgedRule, JAILBREAK_GUARDRAIL_KEY } from '../evaluator/policy';

const rule = (over: Partial<GuardrailRule>): GuardrailRule => ({
  publicId: 'gr-1',
  organizationId: null,
  key: null,
  name: 'A rule',
  kind: 'PATTERN',
  stage: 'INPUT',
  action: 'LOG',
  enabled: true,
  severity: 'warn',
  pattern: null,
  patternIsRegex: false,
  policy: null,
  threshold: null,
  ...over,
});

describe('which rules carry a score', () => {
  it('a policy does, prose or not', () => {
    // The form must offer a threshold field while the rule is being written,
    // which is exactly when it has no prose yet.
    expect(isScoredRule({ kind: 'LLM_POLICY' })).toBe(true);
  });

  it.each(SCORED_BUILT_IN_KEYS)('the %s built-in does', (key) => {
    expect(isScoredRule({ kind: 'BUILT_IN', key })).toBe(true);
  });

  /**
   * Support is per **key**, not per kind. `content-moderation` asks a provider
   * endpoint that answers with a flag, so a threshold on it is a column
   * nothing reads — and a field for it would be a number an operator would
   * reasonably believe they had tuned.
   */
  it('content-moderation does not, though it is a BUILT_IN too', () => {
    expect(isScoredRule({ kind: 'BUILT_IN', key: 'content-moderation' })).toBe(
      false,
    );
  });

  it('every scored key is a real built-in key', () => {
    // A typo here is a detector that is never recognised as scored, which
    // fails by omission: the form silently stops offering the field.
    for (const key of SCORED_BUILT_IN_KEYS) {
      expect(BUILT_IN_GUARDRAIL_KEYS).toContain(key);
    }
  });

  it.each(['PATTERN', 'BUILT_IN'] as const)(
    '%s with no key does not',
    (kind) => {
      expect(isScoredRule({ kind, key: null })).toBe(false);
    },
  );
});

describe('the runtime predicate is the authoring one plus a condition', () => {
  /**
   * They are deliberately not the same question, and C4 tied them together so
   * they cannot drift. `isJudgedRule` is the stricter one: a judge cannot
   * score a message against nothing, so a policy needs prose. The form needs
   * the looser one, or the threshold field would vanish exactly while the
   * operator is filling the policy in.
   */
  it('a policy with no prose is scored but not judged', () => {
    const draft = rule({ kind: 'LLM_POLICY', policy: null });

    expect(isScoredRule(draft)).toBe(true);
    expect(isJudgedRule(draft)).toBe(false);
  });

  it('a policy with prose is both', () => {
    const written = rule({ kind: 'LLM_POLICY', policy: 'Never discuss X.' });

    expect(isScoredRule(written)).toBe(true);
    expect(isJudgedRule(written)).toBe(true);
  });

  it('the jailbreak built-in is both, with no prose of its own', () => {
    const builtIn = rule({
      kind: 'BUILT_IN',
      key: JAILBREAK_GUARDRAIL_KEY,
      policy: null,
    });

    expect(isScoredRule(builtIn)).toBe(true);
    expect(isJudgedRule(builtIn)).toBe(true);
  });

  /**
   * Nothing is judged that is not scored. Asserted as an implication rather
   * than case by case, because the failure it guards is a future kind added to
   * one predicate and not the other — and the two are now one definition
   * precisely so that cannot happen quietly.
   */
  it.each([
    rule({ kind: 'PATTERN', pattern: 'x' }),
    rule({ kind: 'BUILT_IN', key: 'content-moderation' }),
    rule({ kind: 'BUILT_IN', key: null }),
    rule({ kind: 'LLM_POLICY', policy: '  ' }),
    rule({ kind: 'LLM_POLICY', policy: 'written' }),
  ])('judged implies scored (%#)', (r) => {
    if (isJudgedRule(r)) {
      expect(isScoredRule(r)).toBe(true);
    }
  });

  it('the jailbreak key is the scored list’s, not a second spelling', () => {
    expect(SCORED_BUILT_IN_KEYS).toContain(JAILBREAK_GUARDRAIL_KEY);
  });
});
