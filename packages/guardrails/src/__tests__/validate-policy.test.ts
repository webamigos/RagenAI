import { describe, expect, it } from 'vitest';

import {
  AUTHORABLE_COMBINATIONS,
  MAX_ACTIVE_LLM_POLICIES,
} from '../contracts/guardrail';
import { hasEvaluablePolicy } from '../evaluator/policy';
import {
  describePolicyFailure,
  MAX_POLICY_CHARS,
  POLICY_CAP_NOTICE,
  validatePolicy,
} from '../evaluator/validate-policy';

const ok = { policy: 'Never discuss a competitor’s pricing.', threshold: null };

describe('validatePolicy', () => {
  it('accepts prose with no threshold', () => {
    expect(validatePolicy(ok)).toEqual({ ok: true });
  });

  it.each([undefined, null, '', '   ', '\n\t '])(
    'refuses %p as a policy',
    (policy) => {
      const result = validatePolicy({
        policy: policy ?? undefined,
        threshold: null,
      });
      expect(result).toEqual({ ok: false, failure: { code: 'empty' } });
    },
  );

  /**
   * The point of the whole file. If this ever disagrees with the resolver, a
   * rule is written that the resolver then drops — and the only symptom is a
   * panel showing an enabled rule that never fires.
   *
   * Asserted over the same inputs both directions, rather than by trusting
   * that `validatePolicy` calls `hasEvaluablePolicy`: a refactor that inlined
   * the trim here would keep passing every other test in this file.
   */
  it.each([
    ['prose', 'Never discuss pricing.'],
    ['empty', ''],
    ['whitespace', '   \n  '],
    ['one character', 'x'],
  ])('agrees with the resolver about %s', (_label, policy) => {
    expect(validatePolicy({ policy, threshold: null }).ok).toBe(
      hasEvaluablePolicy({ policy }),
    );
  });

  it('refuses a policy longer than the limit', () => {
    const result = validatePolicy({
      policy: 'x'.repeat(MAX_POLICY_CHARS + 1),
      threshold: null,
    });
    expect(result).toEqual({
      ok: false,
      failure: {
        code: 'too-long',
        length: MAX_POLICY_CHARS + 1,
        max: MAX_POLICY_CHARS,
      },
    });
  });

  it('accepts a policy exactly at the limit', () => {
    expect(
      validatePolicy({ policy: 'x'.repeat(MAX_POLICY_CHARS), threshold: null }),
    ).toEqual({ ok: true });
  });

  it.each([0, 0.5, 1])('accepts %p as a threshold', (threshold) => {
    expect(validatePolicy({ ...ok, threshold })).toEqual({ ok: true });
  });

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %p as a threshold',
    (threshold) => {
      expect(validatePolicy({ ...ok, threshold })).toEqual({
        ok: false,
        failure: { code: 'threshold-out-of-range' },
      });
    },
  );

  it('refuses a threshold that is not a number at all', () => {
    // A Server Action takes whatever JSON reached it, so a string here is a
    // stale tab or a hand-made request rather than a hypothetical.
    expect(
      validatePolicy({ ...ok, threshold: '0.7' as unknown as number }),
    ).toEqual({ ok: false, failure: { code: 'threshold-not-a-number' } });
  });
});

describe('what the operator is told', () => {
  it.each([
    { code: 'empty' } as const,
    { code: 'too-long', length: 5000, max: MAX_POLICY_CHARS } as const,
    { code: 'threshold-not-a-number' } as const,
    { code: 'threshold-out-of-range' } as const,
  ])('describes $code without falling through', (failure) => {
    const message = describePolicyFailure(failure);
    expect(message.length).toBeGreaterThan(20);
    expect(message).not.toContain('undefined');
  });

  /**
   * The notice quotes the cap, so the two must not drift. A hard-coded "3" in
   * the sentence survives a change to the constant, and the form would then
   * promise an allowance the loop does not give.
   */
  it('states the cap it is describing', () => {
    expect(POLICY_CAP_NOTICE).toContain(String(MAX_ACTIVE_LLM_POLICIES));
  });
});

describe('what the panel may author', () => {
  /**
   * C3's whole premise. `LLM_POLICY` became *supported* in C1 and authorable
   * only here, because the form had no field for the prose until now — and a
   * policy rule saved with no policy is the row the resolver drops.
   */
  it('offers LLM_POLICY at the input stage', () => {
    expect(AUTHORABLE_COMBINATIONS).toContainEqual({
      kind: 'LLM_POLICY',
      stage: 'INPUT',
    });
  });

  it('still does not offer BUILT_IN, which is seeded rather than created', () => {
    expect(AUTHORABLE_COMBINATIONS.some((c) => c.kind === 'BUILT_IN')).toBe(
      false,
    );
  });
});
