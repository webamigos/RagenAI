import { isThresholdInRange } from '../contracts/guardrail';
import { hasEvaluablePolicy } from './policy';

/**
 * The save-time gate for an `LLM_POLICY` rule, as `validatePattern` is for a
 * pattern one.
 *
 * It exists because the authoring check and the resolver's drop check are the
 * same question asked at two moments, and asking it twice in two places is how
 * a rule gets written that the resolver then discards. Nobody sees that
 * happen: the panel lists the rule, the operator switches it on, and the
 * runtime has no row. So this predicate *is* the resolver's predicate —
 * `hasEvaluablePolicy`, which `resolve.ts` drops on — rather than a second
 * reading of it.
 *
 * That is also why the admin panel imports this and not `hasEvaluablePolicy`
 * itself. `tests/architecture/guardrails-are-not-recopied.test.ts` keeps the
 * evaluation primitives inside this package, and a gate that hands an app a
 * message rather than a boolean is the shape that has always been allowed
 * through — `validatePattern` is the precedent.
 *
 * Unlike the pattern gate there is nothing here to run in a worker: prose
 * cannot backtrack. What it checks is that the judge would be given a question
 * at all, and that the score it is held to is a score.
 */

export const MAX_POLICY_CHARS = 4_000;

export type PolicyValidationInput = {
  readonly policy: string | undefined;
  /** `undefined` or `null` means "use the default", which is always valid. */
  readonly threshold: number | null | undefined;
};

export type PolicyValidationFailure =
  | { readonly code: 'empty' }
  | { readonly code: 'too-long'; readonly length: number; readonly max: number }
  | { readonly code: 'threshold-not-a-number' }
  | { readonly code: 'threshold-out-of-range' };

export type PolicyValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: PolicyValidationFailure };

export function validatePolicy(
  input: PolicyValidationInput,
): PolicyValidationResult {
  // Asked of a rule-shaped object rather than of the string, so this and the
  // resolver cannot drift on what counts as empty — whitespace included.
  if (!hasEvaluablePolicy({ policy: input.policy })) {
    return { ok: false, failure: { code: 'empty' } };
  }

  const policy = input.policy as string;
  if (policy.length > MAX_POLICY_CHARS) {
    // The judge is shown at most `POLICY_JUDGE_MAX_INPUT_CHARS` of the
    // *message*; the policy itself is sent whole, on every turn, for every
    // organization. An operator who pastes a handbook into this field is
    // buying that in input tokens forever, and would find out from an invoice.
    return {
      ok: false,
      failure: {
        code: 'too-long',
        length: policy.length,
        max: MAX_POLICY_CHARS,
      },
    };
  }

  const { threshold } = input;
  if (threshold === undefined || threshold === null) {
    return { ok: true };
  }
  if (typeof threshold !== 'number') {
    return { ok: false, failure: { code: 'threshold-not-a-number' } };
  }
  if (!isThresholdInRange(threshold)) {
    return { ok: false, failure: { code: 'threshold-out-of-range' } };
  }

  return { ok: true };
}

/**
 * What to tell the operator, in one place rather than in each panel.
 *
 * `apps/admin` is the only caller today. It is here anyway because the cap
 * number and the reason for it are a product statement, and a second wording
 * of "three per organization" is a second number to update.
 */
export function describePolicyFailure(
  failure: PolicyValidationFailure,
): string {
  switch (failure.code) {
    case 'empty':
      return (
        'A policy rule needs a policy for the judge to read. A rule saved ' +
        'without one is dropped before it runs, on a page that shows it ' +
        'enabled.'
      );
    case 'too-long':
      return (
        `This policy is ${failure.length} characters and the limit is ` +
        `${failure.max}. The whole policy is sent to the judge on every ` +
        'turn, for every organization, so its length is a recurring cost ' +
        'rather than a one-off.'
      );
    case 'threshold-not-a-number':
      return 'A threshold has to be a number between 0 and 1.';
    case 'threshold-out-of-range':
      return (
        'A threshold is a score between 0 and 1. Leave it empty to use the ' +
        'default.'
      );
  }
}

/** Re-exported: the notice lives in `contracts`, which a form may import. */
export { POLICY_CAP_NOTICE } from '../contracts/guardrail';
