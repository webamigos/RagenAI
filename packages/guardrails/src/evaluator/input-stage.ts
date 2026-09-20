import {
  BLOCKED_HIT_EVENT,
  FLAGGED_HIT_EVENT,
  type GuardrailSecurityEventType,
} from '../contracts/guardrail';
import type { ResolvedGuardrail } from '../resolver/resolve';
import { applyMask, runPatternRules, type PatternHit } from './pattern';
import {
  MAX_ACTIVE_LLM_POLICIES,
  runPolicyRules,
  type JudgePolicy,
} from './policy';

/**
 * The input stage, once, for both runtimes.
 *
 * `apps/web` and `apps/api` differ in how they reach a database, how they
 * record an event and which error class they throw. They must not differ in
 * *what a rule does* — a masking rule that covers history in one runtime and
 * not the other is two products, and the public API is the one nobody would
 * notice was wrong.
 *
 * So the ordering, the block-first rule, the budget and the history pass live
 * here, and each app supplies the three things it genuinely owns. Nothing in
 * this file touches Prisma, Nest, or a provider SDK.
 */

export type ModerationVerdict =
  | { readonly outcome: 'pass' }
  | { readonly outcome: 'hit' }
  /** Could not reach a verdict. Distinct from `pass`: only one is worth an alert. */
  | { readonly outcome: 'error'; readonly reason: string };

export type InputStageDeps = {
  /**
   * Ask the built-in detector. Called at most once, and only when the
   * organization has a `content-moderation` rule enabled — so an installation
   * with no moderation credentials is never asked for them.
   */
  readonly moderate: (text: string) => Promise<ModerationVerdict>;
  /**
   * Ask the judge model to score one `LLM_POLICY` rule.
   *
   * Injected for the same reason `moderate` is: the model call belongs to the
   * runtime, the decision about what the score means belongs here. A binding
   * that forgets to record what the call cost is the failure this phase was
   * split to prevent, which is why both bindings' judges are tested for it.
   */
  readonly judge: JudgePolicy;
  /** Fire-and-forget. Called once per rule that fired. */
  readonly record: (hit: {
    rule: ResolvedGuardrail;
    matchCount?: number;
    /**
     * The judge's 0–1 score, for a policy or a scored built-in.
     *
     * A number, and never the judge's prose reason. The reason paraphrases the
     * customer's message, which is the thing this product encrypts per
     * organization and scrubs before it reaches a log — the same rule that
     * keeps a matched span out of a pattern rule's event.
     */
    score?: number;
  }) => void;
  /**
   * Some rules did not run because the turn's budget was gone.
   *
   * Reported rather than swallowed: a rule that did not run protected nothing,
   * and an organization whose guardrails quietly stop applying as it adds more
   * of them is the failure this phase exists to avoid.
   */
  readonly onBudgetExhausted: (
    skipped: readonly ResolvedGuardrail[],
    elapsedMs: number,
  ) => void;
  /**
   * More policy rules were active than may run at once.
   *
   * Reported for the same reason as the pattern budget and with a different
   * cause: the pattern budget bounds latency, this bounds spend. Either way a
   * rule that did not run protected nothing, and the operator who added the
   * fourth policy is the one person who can act on it.
   */
  readonly onPolicyCapExceeded: (
    skipped: readonly ResolvedGuardrail[],
    cap: number,
  ) => void;
  /**
   * A judge could not answer. Treated as a pass, and said out loud.
   *
   * Not a `record` call: a security event says a rule *fired*, and a rule that
   * could not run is the opposite claim. Conflating them puts a row on the
   * incidents page for every provider blip and makes the hit counts on the
   * guardrails page describe the provider rather than the rule set.
   */
  readonly onJudgeError: (rule: ResolvedGuardrail, reason: string) => void;
};

export type InputStageInput = {
  readonly question: string;
  readonly chatHistory: string;
  /**
   * Whether the built-in detector sees the history as well as the question.
   *
   * A per-chain fact, not a per-rule one: `basic-rag` has always moderated the
   * two together and the conversation chain the question alone. Passed in
   * rather than decided here, so this function changes no existing behaviour.
   */
  readonly moderateHistory: boolean;
};

export type InputStageResult = {
  /** The text to carry on with. Rewritten if a `MASK` rule fired. */
  readonly question: string;
  readonly chatHistory: string;
  /**
   * Set when a `BLOCK` rule matched. The caller throws its own error type —
   * `apps/web` localizes, `apps/api` returns a code in an OpenAI-compatible
   * shape — so this reports rather than throws.
   */
  readonly blockedBy?: ResolvedGuardrail;
};

/** The built-in this stage knows how to ask for. */
export const MODERATION_GUARDRAIL_KEY = 'content-moderation';

export function isModerationRule(rule: ResolvedGuardrail): boolean {
  return rule.kind === 'BUILT_IN' && rule.key === MODERATION_GUARDRAIL_KEY;
}

/**
 * Which security event a hit is filed under.
 *
 * Also one function because it was two, once per runtime. `BLOCK` is the only
 * action that stops a turn, so the only one filed as blocked; `MASK` shares
 * `GUARDRAIL_FLAGGED` with `LOG` because something was found and the turn
 * continued, which is the same story. Two copies drift into the same hit being
 * filed differently depending on which surface it arrived through — and the
 * incidents page would then under-report blocks from one of them.
 *
 * Returns the literals rather than importing Prisma's enum: this package has
 * no database, and the two members have existed in `SecurityEventType` since
 * Phase A specifically so every reader had them before a writer appeared.
 */
export function securityEventTypeFor(
  rule: ResolvedGuardrail,
): GuardrailSecurityEventType {
  return rule.action === 'BLOCK' ? BLOCKED_HIT_EVENT : FLAGGED_HIT_EVENT;
}

export type InputStageOptions = {
  /**
   * The turn's pattern budget, in milliseconds.
   *
   * Exposed because it is the one thing about this function that cannot be
   * observed from outside it: with the default, whether a rule is skipped
   * depends on how fast the machine is, so a test either asserts nothing or
   * asserts something flaky. The first version of the test for this did the
   * former — a conditional assertion followed by `expect(true).toBe(true)` —
   * which is the shape `docs/lessons/three-shapes-of-a-test-that-guards-
   * nothing.md` was written about, on the same day.
   *
   * It is also where a per-organization budget goes if one is ever wanted.
   * Neither binding passes it today.
   */
  readonly budgetMs?: number;
  /**
   * The clock, for the same reason `budgetMs` is here.
   *
   * The question and the history share one budget, and “the history got what
   * was left” cannot be asserted by setting a number alone — whether the
   * question consumed it depends on how fast the machine is. A test that
   * cannot control both ends up asserting nothing, which is the shape this
   * file has already produced once.
   */
  readonly now?: () => number;
  /**
   * How many policy rules may run on this stage. Defaults to
   * `MAX_ACTIVE_LLM_POLICIES`; exposed so a test can state the cap rather than
   * having to author four rules to reach it.
   */
  readonly policyCap?: number;
};

export async function evaluateInputStage(
  rules: readonly ResolvedGuardrail[],
  input: InputStageInput,
  deps: InputStageDeps,
  options: InputStageOptions = {},
): Promise<InputStageResult> {
  const unchanged = {
    question: input.question,
    chatHistory: input.chatHistory,
  };

  if (rules.length === 0) {
    return unchanged;
  }

  const byId = new Map(rules.map((rule) => [rule.publicId, rule]));
  const resolve = (rule: { publicId: string }): ResolvedGuardrail => {
    const found = byId.get(rule.publicId);
    if (!found) {
      throw new Error(
        `Guardrail ${rule.publicId} came back from the evaluator but is not in the resolved set`,
      );
    }
    return found;
  };

  // Patterns first, and against the current message only.
  //
  // Not the history: a `BLOCK` evaluated over `chatHistory` refuses this turn
  // because of something said earlier that was already allowed through, which
  // makes a thread permanently unusable after one borderline message and gives
  // nobody a way to see why. History is masked below — a different operation,
  // which changes what the model is shown and refuses nothing.
  const patternRules = rules.filter((rule) => rule.kind === 'PATTERN');
  const patternOptions: { budgetMs?: number; now?: () => number } = {};
  if (options.budgetMs !== undefined) {
    patternOptions.budgetMs = options.budgetMs;
  }
  if (options.now !== undefined) {
    patternOptions.now = options.now;
  }

  const { hits, skipped, elapsedMs } = runPatternRules(
    patternRules,
    input.question,
    patternOptions,
  );

  if (skipped.length > 0) {
    deps.onBudgetExhausted(skipped.map(resolve), elapsedMs);
  }

  const blockingPattern = hits.find((hit) => hit.rule.action === 'BLOCK');
  if (blockingPattern) {
    const rule = resolve(blockingPattern.rule);
    deps.record({ rule });
    return { ...unchanged, blockedBy: rule };
  }

  // The built-in detector after the patterns, because it is the expensive one:
  // a local regex that already refuses the turn should not be preceded by a
  // network round-trip.
  const moderationRule = rules.find(isModerationRule);
  if (moderationRule) {
    const verdict = await deps.moderate(
      input.moderateHistory
        ? `${input.question} ${input.chatHistory}`
        : input.question,
    );

    if (verdict.outcome === 'hit') {
      deps.record({ rule: moderationRule });
      if (moderationRule.action === 'BLOCK') {
        return { ...unchanged, blockedBy: moderationRule };
      }
    }
    // `error` is neither a pass nor a hit: the adapter has logged it, and
    // treating a provider failure as a hit would let an outage refuse every
    // turn — a classifier that can take the product down is a bigger risk than
    // the one it catches.
  }

  // Policy rules last among the deciding kinds, because they are the most
  // expensive: a local regex or a moderation endpoint that already refuses the
  // turn should not be preceded by one model call per rule.
  //
  // Against the question alone, like the patterns and for the same reason. A
  // policy judged over `chatHistory` refuses this turn for something said
  // earlier and already allowed through, which makes a thread permanently
  // unusable after one borderline message.
  const policyRules = rules.filter((rule) => rule.kind === 'LLM_POLICY');
  if (policyRules.length > 0) {
    const policyRun = await runPolicyRules(
      policyRules,
      input.question,
      deps.judge,
      { cap: options.policyCap ?? MAX_ACTIVE_LLM_POLICIES },
    );

    if (policyRun.skipped.length > 0) {
      deps.onPolicyCapExceeded(
        policyRun.skipped.map(resolve),
        options.policyCap ?? MAX_ACTIVE_LLM_POLICIES,
      );
    }
    for (const failure of policyRun.errors) {
      deps.onJudgeError(resolve(failure.rule), failure.reason);
    }

    // Every hit is recorded before any of them returns, so a `LOG` policy that
    // fired on the same turn as a `BLOCK` one still appears in the hit counts.
    // The pattern branch above cannot do this — it has to return before the
    // expensive kinds run — and that asymmetry is deliberate rather than an
    // inconsistency: there is nothing left to save by returning early here.
    for (const hit of policyRun.hits) {
      deps.record({ rule: resolve(hit.rule), score: hit.score });
    }

    const blockingPolicy = policyRun.hits.find(
      (hit) => hit.rule.action === 'BLOCK',
    );
    if (blockingPolicy) {
      return { ...unchanged, blockedBy: resolve(blockingPolicy.rule) };
    }
  }

  for (const hit of hits.filter((h) => h.rule.action === 'LOG')) {
    deps.record({ rule: resolve(hit.rule), matchCount: hit.spans.length });
  }

  const questionMaskHits = hits.filter((hit) => hit.rule.action === 'MASK');

  // History is masked against **every** mask rule, not against the ones the
  // question happened to match.
  //
  // Deriving the history's rules from the question's hits is wrong in exactly
  // the case masking exists for. `chatHistory` is assembled from stored
  // messages and the stored message is deliberately the original — masking
  // changes what the model is given, not what the thread records. So the
  // secret sits in turn one's history while turn two's question is innocent:
  // the question matches nothing, and a history gated on its hits is never
  // masked. The rule protects one turn and then stops, indistinguishable from
  // working.
  const maskRules = patternRules.filter((rule) => rule.action === 'MASK');

  // The history runs on what is **left** of the turn's budget, not on a fresh
  // copy of it. `budgetMs` is documented as the turn's, and handing the second
  // pass a full one made the real ceiling twice the number — on the slowest
  // possible input, since a history is every stored message concatenated.
  //
  // Its skips are reported too. They were dropped on the floor: only `.hits`
  // was read, so a MASK rule the history pass ran out of time for was not
  // applied and said nothing — a mask silently not applied is the failure
  // this whole feature exists to make visible. Two calls rather than one
  // aggregated, because the question's has to happen before the `BLOCK`
  // return above can skip the rest of this function.
  let historyHits: PatternHit[] = [];
  if (input.chatHistory.length > 0 && maskRules.length > 0) {
    const historyRun = runPatternRules(maskRules, input.chatHistory, {
      ...patternOptions,
      ...(options.budgetMs === undefined
        ? {}
        : { budgetMs: Math.max(0, options.budgetMs - elapsedMs) }),
    });
    historyHits = historyRun.hits;
    if (historyRun.skipped.length > 0) {
      deps.onBudgetExhausted(
        historyRun.skipped.map(resolve),
        elapsedMs + historyRun.elapsedMs,
      );
    }
  }

  if (questionMaskHits.length === 0 && historyHits.length === 0) {
    return unchanged;
  }

  // One event per rule, counting spans across both halves — the same rule
  // matching in the question and in the history is one rule firing, not two.
  const spansByRule = new Map<string, number>();
  for (const hit of [...questionMaskHits, ...historyHits]) {
    spansByRule.set(
      hit.rule.publicId,
      (spansByRule.get(hit.rule.publicId) ?? 0) + hit.spans.length,
    );
  }
  for (const [publicId, matchCount] of spansByRule) {
    deps.record({ rule: resolve({ publicId }), matchCount });
  }

  return {
    question: applyMask(input.question, questionMaskHits),
    chatHistory: applyMask(input.chatHistory, historyHits),
  };
}
