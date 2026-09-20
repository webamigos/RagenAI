import {
  POLICY_JUDGE_MODEL,
  POLICY_JUDGE_TIMEOUT_MS,
  type JudgePolicy,
  type PolicyJudgement,
} from '@ragenai/guardrails';
import { generateObject } from 'ai';
import { z } from 'zod';

import { AiUsageStep } from '@/generated/prisma/client';
import { createChatCompletionInstance } from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import type { ChainTrackingContext } from '@/libs/chains/types/common';

/**
 * apps/web's judge for scored rules — the model call, and its bill.
 *
 * "Scored" is two kinds since C2: an `LLM_POLICY`, judged against the
 * operator's prose, and `jailbreak-detection`, judged against a prompt fixed
 * in code. This file cannot tell them apart and must not: it is handed a
 * system prompt and a user prompt and asks the model. Choosing between them is
 * `judgeRequestFor` in the package, because a choice made here is a choice
 * apps/api could make differently — silently, since both produce a number in
 * the right range.
 *
 * Those two are one file on purpose. A judge model is one call per rule per
 * turn, to an external provider on most installations, and a judge that runs
 * without recording what it cost is exactly the thing this phase was split to
 * prevent: the AI-usage page would show an organization's spend rising with no
 * step accounting for it, and the only way to find out why would be the
 * provider's own invoice.
 *
 * What is *not* here: the prompt, the model id, the timeout and what a score
 * means. Those are `@ragenai/guardrails`, because apps/api has a judge too and
 * two runtimes asking a different question is two products.
 */

/**
 * A number, and nothing else.
 *
 * The classifier's schema also asked for a `reason`, and that field is why
 * this one does not: a judge's explanation quotes or paraphrases the
 * customer's message, and the only places it could go — the security event,
 * the trace — are the two this product deliberately keeps customer content
 * out of. Asking for it and then discarding it would still put it in the
 * provider's response and in whatever logs that response passes through.
 */
const judgementSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe('0 = clearly compliant with the policy, 1 = a clear violation'),
});

export type PolicyJudgeContext = {
  readonly tracking: ChainTrackingContext | undefined;
};

/**
 * Build the judge this runtime hands to `evaluateInputStage`.
 *
 * A factory rather than a bare function so the usage record can carry the
 * organization, project and user the turn belongs to — the same context
 * `recordRephraseUsage` uses, for the same reason: an AI-usage row nobody can
 * attribute is a number on a page and not an answer.
 */
export function createPolicyJudge(context: PolicyJudgeContext): JudgePolicy {
  return async ({ rule, system, prompt }): Promise<PolicyJudgement> => {
    const startedAt = Date.now();

    try {
      const model = createChatCompletionInstance(
        { model: POLICY_JUDGE_MODEL, temperature: 0 },
        false,
      );

      const judging = generateObject({
        model,
        schema: judgementSchema,
        system,
        messages: [{ role: 'user', content: prompt }],
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'guardrail-policy-judge',
        },
      });

      // `Promise.race` against a timer, as the classifier does: the AI SDK's
      // own abort plumbing varies by provider, and a judge that hangs holds
      // the turn open before the model has been asked the question.
      const timing = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('policy judge timeout')),
          POLICY_JUDGE_TIMEOUT_MS,
        );
      });

      const result = await Promise.race([judging, timing]);

      recordJudgeUsage(result.usage, Date.now() - startedAt, context);

      return { outcome: 'scored', score: result.object.score };
    } catch (err) {
      // Pass on error, and say so. The same choice the moderation adapter and
      // the classifier before it both make: a classifier that can take the
      // product down is a bigger risk than the one it catches.
      //
      // The message is truncated because it is a provider's, and provider
      // errors have been known to echo the request back.
      logger.warn(
        { err, audit: true, guardrail: rule.publicId },
        'Policy judge could not answer; the rule did not run for this turn',
      );
      return {
        outcome: 'error',
        reason: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
      };
    }
  };
}

/**
 * The bill, under its own step.
 *
 * `AiUsageStep.GUARDRAIL` rather than `MODERATION`, so the AI-usage page can
 * answer "what did the guardrails cost" — the question an operator asks
 * precisely because policy rules are the expensive kind.
 *
 * Fire-and-forget and never thrown from: broken telemetry must not sink a
 * user-facing turn. A timed-out judge records nothing, because there is no
 * usage to record — the provider may still bill for it, which is the honest
 * limit of measuring this from the client side.
 */
function recordJudgeUsage(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  durationMs: number,
  context: PolicyJudgeContext,
): void {
  const { tracking } = context;
  if (!usage || !tracking) {
    return;
  }

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  void trackAiUsage({
    // Inside the chain, which has no team in scope — as with rephrasing.
    teamId: null,
    organizationId: tracking.organizationId,
    projectId: tracking.projectId ?? null,
    userId: tracking.userId ?? null,
    step: AiUsageStep.GUARDRAIL,
    // The pricing namespace, not a gateway. Same value the rephraser records.
    provider: 'litellm',
    model: POLICY_JUDGE_MODEL,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    durationMs,
  }).catch(() => undefined);
}
