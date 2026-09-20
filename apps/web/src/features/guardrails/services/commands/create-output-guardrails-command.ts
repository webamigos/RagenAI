import {
  createOutputStage,
  type OutputStage,
  type OutputStageOptions,
} from '@ragenai/guardrails';

import { logger } from '@/app/lib/utils/logger';
import type { SecurityEventSource } from '@/features/security/contracts/security-event.types';

import type { OrgGuardrails } from '../../contracts/guardrail-runtime.types';
import { recordGuardrailHit } from '../../utils/record-guardrail-hit';

/**
 * apps/web's binding to the shared output window.
 *
 * The same division as the input stage: what a rule *does* — the window, the
 * boundary, what a block means — is `createOutputStage` in
 * `@ragenai/guardrails`, so this runtime and `apps/api` cannot drift. What is
 * here is the two things this app owns: where a hit is written, and where a
 * skipped rule is reported.
 *
 * Returns `undefined` when there is nothing to do, and the caller passes that
 * straight to `mapFullStream`, which then returns its own iterator unwrapped.
 * An organization with no output rules is not buffered and pays no latency —
 * which is every organization until somebody writes one.
 */

export type OutputGuardrailInput = {
  readonly guardrails: OrgGuardrails | undefined;
  readonly organizationId: string | undefined | null;
  readonly userId?: string | null;
  readonly source: SecurityEventSource;
};

/**
 * `options` is the window's, and no chain passes it.
 *
 * It is here for the same reason the input stage exposes its budget: with the
 * defaults, whether a rule is skipped depends on how fast the machine is, so a
 * test either asserts nothing or asserts something flaky. The alternative was
 * a test that called this, checked the result was defined and moved on —
 * which is the second shape in
 * `docs/lessons/three-shapes-of-a-test-that-guards-nothing.md`.
 */
export function createOutputGuardrailsCommand(
  input: OutputGuardrailInput,
  options: OutputStageOptions = {},
): OutputStage | undefined {
  const { guardrails, organizationId, userId, source } = input;

  if (!guardrails || !organizationId || guardrails.output.length === 0) {
    return undefined;
  }

  return createOutputStage(
    guardrails.output,
    {
      record: ({ rule, matchCount }) =>
        recordGuardrailHit({
          rule,
          organizationId,
          userId,
          source,
          stage: 'OUTPUT',
          matchCount,
        }),
      // Logged rather than filed as a security event, for the reason the input
      // stage gives: an event says a rule fired, and a rule that could not run
      // is the opposite claim.
      onBudgetExhausted: (skipped, elapsedMs) =>
        logger.warn(
          {
            audit: true,
            organizationId,
            elapsedMs,
            skipped: skipped.map((rule) => rule.publicId),
          },
          'Guardrail budget exhausted; some output pattern rules did not run',
        ),
    },
    options,
  );
}
