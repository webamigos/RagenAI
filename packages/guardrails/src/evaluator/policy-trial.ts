import type { GuardrailRule } from '../contracts/guardrail';
import { type JudgePolicy, policyThresholdFor, runPolicyRules } from './policy';

/**
 * Score one draft policy against text an operator pasted — the dry run behind
 * the rule form's "test this policy" box.
 *
 * It exists here, rather than as a few lines in the panel, for the reason the
 * whole package exists: an operator tunes a threshold against what this
 * returns and then switches the rule on. If the box answered a slightly
 * different question from the turn — its own default threshold, its own idea
 * of what a judge error means — the number they tuned against would not be the
 * number that blocks a customer, and nothing would ever say so.
 *
 * So it runs the real loop. `runPolicyRules` with a single rule is the same
 * code path a turn takes, including `policyThresholdFor`'s default and the
 * decision that a judge which could not answer is an error rather than a zero.
 * A cap of one is not a restriction here: there is one rule.
 *
 * What it deliberately does **not** do is persist anything, record a security
 * event or consult `enabled`. A trial is a question about a draft, and a draft
 * has not been saved.
 */

export type PolicyTrialDraft = {
  readonly policy: string;
  /** `null` means the rule names none, so the default applies. */
  readonly threshold: number | null;
};

export type PolicyTrialResult =
  | {
      readonly outcome: 'scored';
      readonly score: number;
      /** The threshold actually applied, default included. */
      readonly threshold: number;
      /** Whether this text would have hit the rule. */
      readonly matched: boolean;
    }
  | { readonly outcome: 'error'; readonly reason: string };

/**
 * The rule id a trial reports under.
 *
 * A trial has no row, and `runPolicyRules` puts the rule's `publicId` in the
 * log line a failing judge writes. A fixed, obviously-not-a-uuid marker is
 * what tells an operator reading logs that the judge failure came from
 * somebody testing a draft rather than from a rule refusing real traffic.
 */
export const POLICY_TRIAL_RULE_ID = 'policy-trial';

export async function runPolicyTrial(
  draft: PolicyTrialDraft,
  text: string,
  judge: JudgePolicy,
): Promise<PolicyTrialResult> {
  const rule: GuardrailRule = {
    publicId: POLICY_TRIAL_RULE_ID,
    organizationId: null,
    key: null,
    name: 'Policy trial',
    kind: 'LLM_POLICY',
    stage: 'INPUT',
    // `LOG`, so that nothing downstream of a hit could ever read this draft as
    // a reason to refuse something. Nothing downstream exists — but a trial
    // rule built as `BLOCK` is one refactor away from mattering.
    action: 'LOG',
    enabled: true,
    severity: 'info',
    policy: draft.policy,
    threshold: draft.threshold,
  };

  const run = await runPolicyRules([rule], text, judge, { cap: 1 });

  const failure = run.errors[0];
  if (failure) {
    return { outcome: 'error', reason: failure.reason };
  }

  const threshold = policyThresholdFor(rule);
  const hit = run.hits[0];
  if (hit) {
    return {
      outcome: 'scored',
      score: hit.score,
      threshold,
      matched: true,
    };
  }

  // A miss still reports its score. An operator tuning a threshold cannot act
  // on "it did not fire" — they need to know whether the message scored 0.05
  // or 0.68 against a threshold of 0.7. That is why `runPolicyRules` returns
  // `scored` as well as `hits`: asking the judge a second time would be a
  // second bill, and at temperature 0 it would still be a second answer.
  const miss = run.scored[0];
  if (!miss) {
    // Unreachable: one rule in, no error, so either a hit or a score. Returned
    // rather than thrown because a trial box that 500s tells an operator less
    // than one that says the judge did not answer.
    return { outcome: 'error', reason: 'the judge returned no score' };
  }

  return { outcome: 'scored', score: miss.score, threshold, matched: false };
}
