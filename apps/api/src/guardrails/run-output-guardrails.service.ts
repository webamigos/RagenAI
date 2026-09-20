import { Injectable, Logger } from '@nestjs/common';
import {
  createOutputStage,
  evaluateOutputText,
  needsWholeAnswer,
  type OutputGuard,
  type OutputStageOptions,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';

import { GuardrailHitService } from './guardrail-hit.service.js';
import type { OrgGuardrails } from './guardrails.service.js';
import { PolicyJudgeService } from './policy-judge.service.js';
import type { TrackAiUsage } from '../ai-usage/types.js';

/**
 * apps/api's binding to the shared output window.
 *
 * The same division as the input stage: what a rule *does* — the window, the
 * boundary, what a block means — is `createOutputStage` in
 * `@ragenai/guardrails`, so this runtime and apps/web cannot drift on it.
 * What is here is where a hit is written and where a skipped rule is reported.
 *
 * Returns `undefined` when there is nothing to do, and the caller hands that
 * straight to `mapFullStream`, which then returns its own iterator unwrapped.
 * An organization with no output rules is not buffered and pays no latency,
 * which is every organization until somebody writes one.
 */

export type ApiOutputGuardrailInput = {
  readonly guardrails: OrgGuardrails;
  readonly organizationId: string;
  readonly userId?: string | null;
  /** `api` for the public API, `chatbot` for the embedded widget. */
  readonly source: 'api' | 'chatbot';
  /** Where a judge model's cost is attributed, on a buffered turn. */
  readonly projectId?: string | null;
  /**
   * Injected rather than imported, like every other usage recorder here — the
   * chain is a plain function with no container to reach into.
   */
  readonly trackAiUsage?: TrackAiUsage;
  /** The organization's own provider credentials, when it has them. */
  readonly apiKey?: string;
};

@Injectable()
export class RunOutputGuardrailsService {
  private readonly logger = new Logger(RunOutputGuardrailsService.name);

  constructor(
    private readonly hits: GuardrailHitService,
    private readonly policyJudge: PolicyJudgeService,
  ) {}

  /**
   * Build the window for one turn.
   *
   * `options` is the window's and no chain passes it. It is here for the
   * reason the input stage exposes its budget: with the defaults, whether a
   * rule is skipped depends on how fast the machine is, so a test either
   * asserts nothing or asserts something flaky.
   */
  guardFor(
    input: ApiOutputGuardrailInput,
    options: OutputStageOptions & { policyCap?: number } = {},
  ): OutputGuard | undefined {
    if (input.guardrails.output.length === 0) {
      return undefined;
    }

    const record = (hit: {
      rule: ResolvedGuardrail;
      matchCount?: number;
      score?: number;
    }): void =>
      this.hits.record({
        rule: hit.rule,
        stage: 'OUTPUT',
        source: input.source,
        organizationId: input.organizationId,
        userId: input.userId,
        matchCount: hit.matchCount,
        score: hit.score,
      });

    // Logged, not recorded as a security event: an event says a rule fired,
    // and a rule that could not run is the opposite claim.
    const reportSkipped =
      (what: string) =>
      (skipped: readonly ResolvedGuardrail[]): void =>
        this.logger.warn(
          `${skipped.length} output ${what} did not run for ${input.organizationId}`,
        );

    // One judged rule and the whole turn is buffered: a judge scores the
    // finished answer, so there is no verdict to act on before the last
    // token. Decided here rather than in the chain because it decides what
    // the caller sees happen.
    if (needsWholeAnswer(input.guardrails.output)) {
      return {
        mode: 'buffered',
        evaluate: (text) =>
          evaluateOutputText(
            input.guardrails.output,
            text,
            {
              judge: this.policyJudge.forTurn({
                organizationId: input.organizationId,
                projectId: input.projectId,
                userId: input.userId,
                trackAiUsage: input.trackAiUsage,
                apiKey: input.apiKey,
              }),
              record,
              onBudgetExhausted: reportSkipped('pattern rule(s)'),
              onPolicyCapExceeded: reportSkipped(
                'policy rule(s) past the cap, which',
              ),
              onJudgeError: (rule, reason) =>
                this.logger.warn(
                  `Output policy rule ${rule.publicId} did not run for ${input.organizationId}: ${reason}`,
                ),
            },
            options,
          ),
      };
    }

    return {
      mode: 'window',
      stage: createOutputStage(
        input.guardrails.output,
        { record, onBudgetExhausted: reportSkipped('pattern rule(s)') },
        options,
      ),
    };
  }
}
