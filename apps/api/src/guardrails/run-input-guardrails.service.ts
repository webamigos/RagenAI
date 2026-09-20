import { Injectable, Logger } from '@nestjs/common';
import {
  evaluateInputStage,
  securityEventTypeFor,
  type ModerationVerdict,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';

import { GuardrailError } from '../chains/errors.js';
import { SecurityEventService } from '../security/security-event.service.js';
import type { ModerationInstance } from '../chains/moderation-instance.js';
import type { OrgGuardrails } from './guardrails.service.js';

/**
 * apps/api's binding to the shared input stage.
 *
 * What a rule *does* is `evaluateInputStage` in `@ragenai/guardrails`, the
 * same function apps/web calls. This supplies the three things this runtime
 * owns: its moderation client, its `SecurityEventService`, and the error it
 * throws.
 *
 * **Known gap, inherited rather than introduced.**
 * `SecurityEventService` does not send alert emails — it says so in its own
 * header, and it was written while nothing called it. B4 is its first real
 * caller, so a `critical` guardrail hit on the API path writes a row and logs
 * it where the same hit on the web path would also email. Not fixed here
 * because porting the mailer is a separate piece of work, but it is now live
 * rather than theoretical, and that is worth knowing before an incident.
 */

export type ApiInputGuardrailInput = {
  readonly guardrails: OrgGuardrails;
  /**
   * A factory, not an instance.
   *
   * `createModerationInstance()` throws without an OpenAI key, and the whole
   * point of the factory in `BaseChatChainModels` is that the key is only
   * required by the path that calls the API. Calling it eagerly here would
   * reintroduce the failure that factory exists to prevent: every chat request
   * failing on an installation that deliberately configured no OpenAI, for a
   * feature it is not using.
   */
  readonly moderator: () => ModerationInstance;
  readonly question: string;
  readonly chatHistory: string | undefined;
  readonly moderateHistory: boolean;
  readonly organizationId: string;
  readonly userId?: string | null;
  /** `api` for the public API, `chatbot` for the embedded widget. */
  readonly source: 'api' | 'chatbot';
};

@Injectable()
export class RunInputGuardrailsService {
  private readonly logger = new Logger(RunInputGuardrailsService.name);

  constructor(private readonly securityEvents: SecurityEventService) {}

  private async moderate(
    factory: () => ModerationInstance,
    text: string,
  ): Promise<ModerationVerdict> {
    let moderator: ModerationInstance;
    try {
      moderator = factory();
    } catch (err) {
      // Reachable and not a reason to refuse the turn: an administrator
      // enabled a check this deployment has no credentials for. A
      // misconfiguration worth saying out loud, not a content decision.
      this.logger.warn(
        'content-moderation is enabled but no moderation provider is configured',
        err,
      );
      return { outcome: 'error', reason: 'no-moderation-provider' };
    }

    try {
      const { results } = await moderator.invoke({ input: text });
      const result = results[0];
      if (!result) {
        // A response with no results is not a clean bill of health. The old
        // `runModeration` threw `ModerationError` here, which surfaced to the
        // caller as a content refusal — a provider shape problem presented as
        // "your message was rejected".
        return { outcome: 'error', reason: 'no-results' };
      }
      return result.flagged ? { outcome: 'hit' } : { outcome: 'pass' };
    } catch (err) {
      this.logger.error('Moderation provider call failed', err);
      return {
        outcome: 'error',
        reason: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
      };
    }
  }

  private record(
    rule: ResolvedGuardrail,
    input: ApiInputGuardrailInput,
    matchCount?: number,
  ): void {
    this.securityEvents.record({
      // The mapping is the package's, so this runtime and apps/web cannot file
      // the same hit differently. No cast is needed: `SecurityEventType` has
      // carried both members since Phase A, which added them to the enum with
      // no writer precisely so every reader would have them first.
      eventType: securityEventTypeFor(rule),
      // The rule's own severity, not a constant: an operator who set a rule to
      // `info` said it was noise, and overriding that makes the alerting
      // threshold unreachable.
      severity: rule.severity,
      source: input.source,
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      metadata: {
        guardrail: rule.publicId,
        rule: rule.key ?? rule.name,
        kind: rule.kind,
        stage: 'INPUT',
        action: rule.action,
        // A count, never the text. The matched span is the caller's own
        // message, and this table is rendered in plain text in the admin panel.
        ...(matchCount === undefined ? {} : { matchCount }),
      },
    });
  }

  async run(
    input: ApiInputGuardrailInput,
  ): Promise<{ question: string; chatHistory: string }> {
    const result = await evaluateInputStage(
      input.guardrails.input,
      {
        question: input.question,
        chatHistory: input.chatHistory ?? '',
        moderateHistory: input.moderateHistory,
      },
      {
        moderate: (text) => this.moderate(input.moderator, text),
        record: ({ rule, matchCount }) => this.record(rule, input, matchCount),
        onBudgetExhausted: (skipped, elapsedMs) =>
          this.logger.warn(
            `Guardrail budget exhausted after ${elapsedMs}ms; ${skipped.length} pattern rule(s) did not run for ${input.organizationId}`,
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
}
