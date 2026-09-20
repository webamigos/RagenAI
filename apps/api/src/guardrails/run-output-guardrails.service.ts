import { Injectable, Logger } from '@nestjs/common';
import {
  createOutputStage,
  type OutputStage,
  type OutputStageOptions,
} from '@ragenai/guardrails';

import { GuardrailHitService } from './guardrail-hit.service.js';
import type { OrgGuardrails } from './guardrails.service.js';

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
};

@Injectable()
export class RunOutputGuardrailsService {
  private readonly logger = new Logger(RunOutputGuardrailsService.name);

  constructor(private readonly hits: GuardrailHitService) {}

  /**
   * Build the window for one turn.
   *
   * `options` is the window's and no chain passes it. It is here for the
   * reason the input stage exposes its budget: with the defaults, whether a
   * rule is skipped depends on how fast the machine is, so a test either
   * asserts nothing or asserts something flaky.
   */
  stageFor(
    input: ApiOutputGuardrailInput,
    options: OutputStageOptions = {},
  ): OutputStage | undefined {
    if (input.guardrails.output.length === 0) {
      return undefined;
    }

    return createOutputStage(
      input.guardrails.output,
      {
        record: ({ rule, matchCount }) =>
          this.hits.record({
            rule,
            stage: 'OUTPUT',
            source: input.source,
            organizationId: input.organizationId,
            userId: input.userId,
            matchCount,
          }),
        // Logged, not recorded as a security event: an event says a rule
        // fired, and a rule that could not run is the opposite claim.
        onBudgetExhausted: (skipped, elapsedMs) =>
          this.logger.warn(
            `Guardrail budget exhausted after ${elapsedMs}ms; ${skipped.length} output pattern rule(s) did not run for ${input.organizationId}`,
          ),
      },
      options,
    );
  }
}
