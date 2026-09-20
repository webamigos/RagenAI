import {
  createOutputStage,
  evaluateOutputText,
  needsWholeAnswer,
  type OutputGuard,
  type OutputStageOptions,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';

import { logger } from '@/app/lib/utils/logger';
import type { SecurityEventSource } from '@/features/security/contracts/security-event.types';
import type { ChainTrackingContext } from '@/libs/chains/types/common';

import type { OrgGuardrails } from '../../contracts/guardrail-runtime.types';
import { createPolicyJudge } from '../../utils/policy-judge';
import { recordGuardrailHit } from '../../utils/record-guardrail-hit';

/**
 * apps/web's binding to the output stage — both of them.
 *
 * The same division as the input stage: what a rule *does* is the package's,
 * so this runtime and `apps/api` cannot drift on it. What is here is the two
 * things this app owns — where a hit is written and where a skipped rule is
 * reported — plus the one decision that is neither: **which mode the turn
 * runs in**.
 *
 * That decision belongs here rather than inside the funnel because it decides
 * what the reader sees happen. A judged rule scores the finished answer, so
 * nothing can be released until the last token has landed; the answer then
 * appears at once instead of word by word, which the rule form states next to
 * the toggle (`OUTPUT_POLICY_LATENCY_NOTICE`). A turn cannot change its mind
 * halfway — by then it would have streamed half an answer.
 *
 * Returns `undefined` when there is nothing to do, and the caller passes that
 * straight to `mapFullStream`, which then returns its own iterator unwrapped.
 * An organization with no output rules is not buffered and pays no latency,
 * which is every organization until somebody writes a rule.
 */

export type OutputGuardrailInput = {
  readonly guardrails: OrgGuardrails | undefined;
  readonly organizationId: string | undefined | null;
  readonly userId?: string | null;
  readonly source: SecurityEventSource;
  /**
   * Where a judge model's cost is attributed, on a buffered turn.
   *
   * Optional only because `organizationId` already carries the one field a
   * usage row cannot do without; a caller that omits it loses the project and
   * user columns, not the row.
   */
  readonly tracking?: ChainTrackingContext;
};

/**
 * `options` is the evaluator's, and no chain passes it.
 *
 * It is here for the reason the input stage exposes its budget: with the
 * defaults, whether a rule is skipped depends on how fast the machine is, so a
 * test either asserts nothing or asserts something flaky. The alternative was
 * a test that called this, checked the result was defined and moved on —
 * which is the second shape in
 * `docs/lessons/three-shapes-of-a-test-that-guards-nothing.md`.
 */
export function createOutputGuardrailsCommand(
  input: OutputGuardrailInput,
  options: OutputStageOptions & { policyCap?: number } = {},
): OutputGuard | undefined {
  const { guardrails, organizationId, userId, source } = input;

  if (!guardrails || !organizationId || guardrails.output.length === 0) {
    return undefined;
  }

  const record = (hit: {
    rule: ResolvedGuardrail;
    matchCount?: number;
    score?: number;
  }) =>
    recordGuardrailHit({
      rule: hit.rule,
      organizationId,
      userId,
      source,
      stage: 'OUTPUT',
      matchCount: hit.matchCount,
      score: hit.score,
    });

  // Logged rather than filed as a security event, for the reason the input
  // stage gives: an event says a rule fired, and a rule that could not run is
  // the opposite claim — filing it as one puts a row on the incidents page for
  // a budget problem and inflates the hit counts on the guardrails page.
  const reportSkipped =
    (message: string) => (skipped: readonly ResolvedGuardrail[]) =>
      logger.warn(
        {
          audit: true,
          organizationId,
          skipped: skipped.map((rule) => rule.publicId),
        },
        message,
      );

  const BUDGET_MESSAGE =
    'Guardrail budget exhausted; some output pattern rules did not run';

  if (needsWholeAnswer(guardrails.output)) {
    return {
      mode: 'buffered',
      evaluate: (text) =>
        evaluateOutputText(
          guardrails.output,
          text,
          {
            judge: createPolicyJudge({
              tracking: input.tracking ?? { organizationId, userId },
            }),
            record,
            onBudgetExhausted: reportSkipped(BUDGET_MESSAGE),
            onPolicyCapExceeded: reportSkipped(
              'More output policy rules are active than may run at once; some did not run',
            ),
            onJudgeError: (rule, reason) =>
              logger.warn(
                {
                  audit: true,
                  organizationId,
                  guardrail: rule.publicId,
                  reason,
                },
                'An output policy rule did not run: its judge could not answer',
              ),
          },
          options,
        ),
    };
  }

  return {
    mode: 'window',
    stage: createOutputStage(
      guardrails.output,
      { record, onBudgetExhausted: reportSkipped(BUDGET_MESSAGE) },
      options,
    ),
  };
}
