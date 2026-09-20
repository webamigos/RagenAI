import type { GuardrailDrop, ResolvedGuardrail } from '@ragenai/guardrails';

/**
 * What one organization is subject to on this turn.
 *
 * `ResolvedGuardrail[]` alone would be enough to evaluate, and is not enough
 * to *schedule*. Two facts the chain needs before it starts are properties of
 * the whole set rather than of any rule, so they are computed once here instead
 * of being re-derived at each call site — which is how two call sites come to
 * disagree.
 */
export type OrgGuardrails = {
  /** Input-stage rules, in the order they should run. */
  readonly input: readonly ResolvedGuardrail[];
  /** Output-stage rules. Unused until Phase D; loaded now so it is not a second query later. */
  readonly output: readonly ResolvedGuardrail[];
  /**
   * True when this set is empty because something went wrong, not because
   * nothing is configured.
   *
   * The two are indistinguishable downstream and must not be: "no rules" is
   * the steady state of most installations, and "we could not read the rules"
   * is an incident. Callers do not change behaviour on it — the decision to
   * fail open is already made — but a caller that wants to say so in a trace
   * can.
   */
  readonly degraded: boolean;
  /** Rows the resolver refused, for the caller that wants to log them. */
  readonly dropped: readonly GuardrailDrop[];
};

/** An empty set, which is what fail-open and the break-glass both produce. */
export const NO_GUARDRAILS: OrgGuardrails = {
  input: [],
  output: [],
  degraded: false,
  dropped: [],
};
