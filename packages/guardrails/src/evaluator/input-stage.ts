import type { ResolvedGuardrail } from '../resolver/resolve';
import { applyMask, runPatternRules, type PatternHit } from './pattern';

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
  /** Fire-and-forget. Called once per rule that fired. */
  readonly record: (hit: {
    rule: ResolvedGuardrail;
    matchCount?: number;
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

export async function evaluateInputStage(
  rules: readonly ResolvedGuardrail[],
  input: InputStageInput,
  deps: InputStageDeps,
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
  const { hits, skipped, elapsedMs } = runPatternRules(
    patternRules,
    input.question,
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
  const historyHits: PatternHit[] =
    input.chatHistory.length > 0 && maskRules.length > 0
      ? runPatternRules(maskRules, input.chatHistory).hits
      : [];

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
