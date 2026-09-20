import { Injectable, Logger } from '@nestjs/common';
import {
  JudgeTimeoutError,
  POLICY_JUDGE_MODEL,
  POLICY_JUDGE_TIMEOUT_MS,
  providerErrorReason,
  type JudgePolicy,
  type PolicyJudgement,
} from '@ragenai/guardrails';
import { generateObject } from 'ai';
import { z } from 'zod';

import { createChatCompletionInstance } from '../llm/model-instances.js';
import type { TrackAiUsage } from '../ai-usage/types.js';

/**
 * apps/api's judge for scored rules — the model call, and its bill.
 *
 * "Scored" is two kinds since C2: an `LLM_POLICY` and `jailbreak-detection`.
 * This service cannot tell them apart and must not — it is handed a system
 * prompt and a user prompt. Which prompt a rule gets is `judgeRequestFor` in
 * the package.
 *
 * C2 is also what gives the public API a jailbreak detector at all: the old
 * classifier was called from two apps/web routes and from nothing here, so the
 * rule resolved for API traffic and was enforced by nothing.
 *
 * The two are one service for the reason C1 is one step: a judge that runs
 * without recording what it cost is a per-turn, per-rule call to an external
 * provider that appears on nobody's usage page. On this runtime that matters
 * more than on the panel's, because API traffic is automated — an unbilled
 * judge here scales with a customer's integration rather than with how often
 * somebody types.
 *
 * The prompt, the model, the timeout and what a score means are
 * `@ragenai/guardrails`, shared with apps/web. Two runtimes asking a different
 * question is two products, and the public API is the one nobody would notice
 * was wrong.
 */

/**
 * A number, and nothing else — the same schema apps/web's judge uses.
 *
 * No `reason` field: a judge's explanation paraphrases the caller's own
 * message, and the places it could go are the two this product keeps customer
 * content out of.
 */
const judgementSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe('0 = clearly compliant with the policy, 1 = a clear violation'),
});

export type PolicyJudgeContext = {
  readonly organizationId: string;
  readonly projectId?: string | null;
  readonly userId?: string | null;
  /**
   * Injected rather than imported, like every other usage recorder in this
   * app: these services are constructed by Nest and the chain is not.
   *
   * A turn that arrives without one still gets its rules evaluated — refusing
   * to guard a turn because telemetry is unavailable would be the wrong trade
   * — but it is a gap worth seeing, so it is logged rather than ignored.
   */
  readonly trackAiUsage?: TrackAiUsage;
  /** The org's own credentials, when it has them. */
  readonly apiKey?: string;
};

@Injectable()
export class PolicyJudgeService {
  private readonly logger = new Logger(PolicyJudgeService.name);

  /** Build the judge handed to `evaluateInputStage` for one turn. */
  forTurn(context: PolicyJudgeContext): JudgePolicy {
    return async ({ rule, system, prompt }): Promise<PolicyJudgement> => {
      const startedAt = Date.now();

      try {
        const model = createChatCompletionInstance({
          apiKey: context.apiKey,
          model: POLICY_JUDGE_MODEL,
          temperature: 0,
        });

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

        // Raced against a timer rather than left to the provider's own abort
        // plumbing, which varies by provider — a judge that hangs holds the
        // turn open before the model has been asked the question at all.
        const timing = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new JudgeTimeoutError()),
            POLICY_JUDGE_TIMEOUT_MS,
          );
        });

        const result = await Promise.race([judging, timing]);

        this.recordUsage(result.usage, Date.now() - startedAt, context);

        return { outcome: 'scored', score: result.object.score };
      } catch (err) {
        // Pass on error. The same choice the moderation adapter makes: a
        // classifier that can take the product down is a bigger risk than the
        // one it catches.
        //
        // **Described, never handed to the logger.** Passing `err` as a
        // parameter here printed the caller's own message: the AI SDK's
        // `APICallError` carries `requestBodyValues`, the whole request body,
        // and Nest's logger renders an error parameter in full. Verified, on
        // this runtime, not inferred from apps/web's.
        this.logger.warn(
          `Policy judge could not answer for ${rule.publicId} (${providerErrorReason(err)}); the rule did not run for this turn`,
        );
        return { outcome: 'error', reason: providerErrorReason(err) };
      }
    };
  }

  /**
   * The bill, under `GUARDRAIL` rather than `MODERATION`.
   *
   * Fire-and-forget — `AiUsageService.track` never throws, and broken
   * telemetry must not sink a turn. A timed-out judge records nothing, because
   * there is no usage to record; the provider may still bill for it, which is
   * the honest limit of measuring this from the client side.
   */
  private recordUsage(
    usage: { inputTokens?: number; outputTokens?: number } | undefined,
    durationMs: number,
    context: PolicyJudgeContext,
  ): void {
    if (!context.trackAiUsage) {
      this.logger.warn(
        `A policy judge ran for ${context.organizationId} with no usage recorder; its cost is not on any page`,
      );
      return;
    }
    if (!usage) {
      return;
    }

    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;

    void context
      .trackAiUsage({
        organizationId: context.organizationId,
        projectId: context.projectId ?? null,
        userId: context.userId ?? null,
        step: 'GUARDRAIL',
        // The pricing namespace, not a gateway — the value every other step
        // in this runtime records.
        provider: 'litellm',
        model: POLICY_JUDGE_MODEL,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs,
      })
      .catch(() => undefined);
  }
}
