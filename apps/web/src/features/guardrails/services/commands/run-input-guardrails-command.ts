import { evaluateInputStage } from '@ragenai/guardrails';

import type { ModerationInstance } from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { GuardrailError } from '@/libs/chains/errors';
import type { SecurityEventSource } from '@/features/security/contracts/security-event.types';
import type { ChainTrackingContext } from '@/libs/chains/types/common';

import type { OrgGuardrails } from '../../contracts/guardrail-runtime.types';
import { evaluateModeration } from '../../utils/moderation-evaluator';
import { createPolicyJudge } from '../../utils/policy-judge';
import { recordGuardrailHit } from '../../utils/record-guardrail-hit';

/**
 * apps/web's binding to the shared input stage.
 *
 * Everything about *what a rule does* — the ordering, block-first, the budget,
 * the history pass — is `evaluateInputStage` in `@ragenai/guardrails`, so this
 * runtime and `apps/api` cannot drift. What is here is the three things this
 * app genuinely owns: its moderation client, its security-event writer, and
 * the error it throws.
 *
 * Returns the text to carry on with, because a `MASK` rule rewrites it. A
 * caller that ignores the return value gets the original and silently defeats
 * every masking rule, which is why the result is the text and not a verdict.
 */

export type InputGuardrailInput = {
  readonly guardrails: OrgGuardrails;
  readonly moderator: ModerationInstance | undefined;
  readonly question: string;
  /** Optional because a first turn has no history; normalised once, here. */
  readonly chatHistory: string | undefined;
  /**
   * Whether the built-in detector sees the history as well as the question.
   *
   * Preserved per chain rather than unified: `basic-rag` has always moderated
   * the two together and `conversation-chain` the question alone. Changing
   * either would be a behaviour change smuggled in beside a configuration
   * change — the thing this phase is explicitly trying not to do.
   */
  readonly moderateHistory: boolean;
  readonly organizationId: string;
  readonly userId?: string | null;
  readonly source: SecurityEventSource;
  /**
   * Where a judge model's cost is attributed.
   *
   * Optional only because `organizationId` above already carries the one field
   * a usage row cannot do without; a caller that omits it loses the project
   * and user columns, not the row. Every chain call site passes it.
   */
  readonly tracking?: ChainTrackingContext;
};

export type InputGuardrailResult = {
  readonly question: string;
  readonly chatHistory: string;
};

export async function runInputGuardrailsCommand(
  input: InputGuardrailInput,
): Promise<InputGuardrailResult> {
  const { guardrails, organizationId, userId, source } = input;

  const result = await evaluateInputStage(
    guardrails.input,
    {
      question: input.question,
      chatHistory: input.chatHistory ?? '',
      moderateHistory: input.moderateHistory,
    },
    {
      moderate: (text) => evaluateModeration(input.moderator, text),
      judge: createPolicyJudge({
        tracking: input.tracking ?? { organizationId, userId },
      }),
      record: ({ rule, matchCount, score }) =>
        recordGuardrailHit({
          rule,
          organizationId,
          userId,
          source,
          stage: 'INPUT',
          matchCount,
          score,
        }),
      onBudgetExhausted: (skipped, elapsedMs) =>
        logger.warn(
          {
            audit: true,
            organizationId,
            elapsedMs,
            skipped: skipped.map((rule) => rule.publicId),
          },
          'Guardrail budget exhausted; some pattern rules did not run',
        ),
      onPolicyCapExceeded: (skipped, cap) =>
        logger.warn(
          {
            audit: true,
            organizationId,
            cap,
            skipped: skipped.map((rule) => rule.publicId),
          },
          'More policy rules are active than may run at once; some did not run',
        ),
      // Logged, not recorded as a security event. An event says a rule fired,
      // and a rule that could not run is the opposite claim — filing it as one
      // puts a row on the incidents page for every provider blip and makes the
      // guardrails page's hit counts describe the provider rather than the
      // rule set.
      onJudgeError: (rule, reason) =>
        logger.warn(
          { audit: true, organizationId, guardrail: rule.publicId, reason },
          'A policy rule did not run: its judge could not answer',
        ),
    },
  );

  if (result.blockedBy) {
    throw new GuardrailError(
      result.blockedBy.publicId,
      result.blockedBy.key ?? result.blockedBy.name,
    );
  }

  return { question: result.question, chatHistory: result.chatHistory };
}
