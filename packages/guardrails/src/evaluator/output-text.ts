import { MAX_ACTIVE_LLM_POLICIES } from '../contracts/guardrail';
import type { ResolvedGuardrail } from '../resolver/resolve';
import type { OutputStage } from './output-stage';
import { applyMask, runPatternRules, type PatternHit } from './pattern';
import { isJudgedRule, runPolicyRules, type JudgePolicy } from './policy';

/**
 * The output stage for an answer that is finished — the other half of D.
 *
 * `createOutputStage` slides a window over deltas, which is what lets a
 * `PATTERN` rule act while the answer is still arriving. A judge cannot work
 * that way: it scores a whole answer against a policy, so there is nothing to
 * decide until the last token has landed. A rule of that kind therefore turns
 * the turn from streamed into buffered, and once the whole answer is in hand
 * the window has no work left to do either — patterns run over the complete
 * text, in one pass, with no boundary to respect.
 *
 * So this is not "the window plus a judge". It is the mode a turn switches to
 * when a judged output rule exists, and the funnel picks between the two
 * before the first token. The rule form says so where an operator will meet
 * it: an answer judged by a model appears at once instead of word by word.
 *
 * Ordering, block-first and the cap are the input stage's, deliberately —
 * patterns before judges because a local regex that already refuses should not
 * be preceded by a model call per rule.
 */

export type OutputTextDeps = {
  readonly judge: JudgePolicy;
  /** Fire-and-forget. Called once per rule that fired. */
  readonly record: (hit: {
    rule: ResolvedGuardrail;
    matchCount?: number;
    /**
     * The judge's 0–1 score.
     *
     * A number, and never the judge's prose reason: that paraphrases the
     * answer, which is the thing this product encrypts per organization and
     * scrubs before it reaches a log.
     */
    score?: number;
  }) => void;
  readonly onBudgetExhausted: (
    skipped: readonly ResolvedGuardrail[],
    elapsedMs: number,
  ) => void;
  readonly onPolicyCapExceeded: (
    skipped: readonly ResolvedGuardrail[],
    cap: number,
  ) => void;
  /**
   * A judge could not answer. Treated as a pass, and said out loud.
   *
   * Not a `record` call: an event says a rule *fired*, and a rule that could
   * not run is the opposite claim. Conflating them puts a row on the incidents
   * page for every provider blip.
   */
  readonly onJudgeError: (rule: ResolvedGuardrail, reason: string) => void;
};

export type OutputTextOptions = {
  readonly budgetMs?: number;
  readonly now?: () => number;
  readonly policyCap?: number;
};

export type OutputTextResult = {
  /** The answer to release. Rewritten if a `MASK` rule fired. */
  readonly text: string;
  /** Set when a `BLOCK` rule matched. The caller withholds the answer. */
  readonly blockedBy?: ResolvedGuardrail;
};

/**
 * Whether this rule set makes the turn buffered.
 *
 * Asked once, before the first token, because the answer decides which of the
 * two output modes the funnel uses — and a turn that discovered halfway
 * through that it needed the whole answer would have already streamed half of
 * it.
 */
export function needsWholeAnswer(rules: readonly ResolvedGuardrail[]): boolean {
  return rules.some(isJudgedRule);
}

export async function evaluateOutputText(
  rules: readonly ResolvedGuardrail[],
  text: string,
  deps: OutputTextDeps,
  options: OutputTextOptions = {},
): Promise<OutputTextResult> {
  if (rules.length === 0) {
    return { text };
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

  const patternOptions: { budgetMs?: number; now?: () => number } = {};
  if (options.budgetMs !== undefined) {
    patternOptions.budgetMs = options.budgetMs;
  }
  if (options.now !== undefined) {
    patternOptions.now = options.now;
  }

  // Patterns first, over the complete answer. No window and no context: the
  // whole string is here, so `^`, `$` and `\b` mean what they say — which is
  // also why `validatePatternShape` still refuses anchors for output rules.
  // A rule is authored once and may run in either mode, and one that behaved
  // differently depending on whether the organization also has a policy would
  // be the worst kind of surprise.
  const patternRules = rules.filter((rule) => rule.kind === 'PATTERN');
  const { hits, skipped, elapsedMs } = runPatternRules(
    patternRules,
    text,
    patternOptions,
  );

  if (skipped.length > 0) {
    deps.onBudgetExhausted(skipped.map(resolve), elapsedMs);
  }

  const blockingPattern = hits.find((hit) => hit.rule.action === 'BLOCK');
  if (blockingPattern) {
    const rule = resolve(blockingPattern.rule);
    deps.record({ rule });
    return { text, blockedBy: rule };
  }

  const judged = rules.filter(isJudgedRule);
  if (judged.length > 0) {
    const cap = options.policyCap ?? MAX_ACTIVE_LLM_POLICIES;
    const run = await runPolicyRules(judged, text, deps.judge, { cap });

    if (run.skipped.length > 0) {
      deps.onPolicyCapExceeded(run.skipped.map(resolve), cap);
    }
    for (const failure of run.errors) {
      deps.onJudgeError(resolve(failure.rule), failure.reason);
    }
    // Every hit is recorded before any of them returns, so a `LOG` policy that
    // fired on the same answer as a `BLOCK` one still appears in the counts.
    for (const hit of run.hits) {
      deps.record({ rule: resolve(hit.rule), score: hit.score });
    }

    const blockingPolicy = run.hits.find((hit) => hit.rule.action === 'BLOCK');
    if (blockingPolicy) {
      return { text, blockedBy: resolve(blockingPolicy.rule) };
    }
  }

  const maskHits: PatternHit[] = hits.filter(
    (hit) => hit.rule.action === 'MASK',
  );
  for (const hit of hits.filter((h) => h.rule.action !== 'BLOCK')) {
    deps.record({ rule: resolve(hit.rule), matchCount: hit.spans.length });
  }

  return { text: maskHits.length > 0 ? applyMask(text, maskHits) : text };
}

/**
 * Which of the two output modes a turn runs in, decided before the first token.
 *
 * The funnel takes one of these or nothing at all. A union rather than a
 * nullable window because the modes are not degrees of the same thing: one
 * releases text as it goes and one holds every word until a model has read the
 * answer, and a caller that treated the second as "the window, plus waiting"
 * would stream half an answer before discovering otherwise.
 */
export type OutputGuard =
  | { readonly mode: 'window'; readonly stage: OutputStage }
  | {
      readonly mode: 'buffered';
      readonly evaluate: (text: string) => Promise<OutputTextResult>;
    };
