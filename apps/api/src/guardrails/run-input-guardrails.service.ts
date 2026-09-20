import { Injectable, Logger } from '@nestjs/common';
import {
  describeProviderError,
  evaluateInputStage,
  providerErrorReason,
  type ModerationVerdict,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';

import { GuardrailError } from '../chains/errors.js';
import { GuardrailHitService } from './guardrail-hit.service.js';
import type { ModerationInstance } from '../chains/moderation-instance.js';
import type { OrgGuardrails } from './guardrails.service.js';
import { PolicyJudgeService } from './policy-judge.service.js';
import type { TrackAiUsage } from '../ai-usage/types.js';

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
  /** Where a judge model's cost is attributed. */
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
export class RunInputGuardrailsService {
  private readonly logger = new Logger(RunInputGuardrailsService.name);

  constructor(
    private readonly hits: GuardrailHitService,
    private readonly policyJudge: PolicyJudgeService,
  ) {}

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
      // No `err`: this one is a local construction failure rather than a
      // provider response, but the rule is the same and an exception here is
      // not worth making a second judgement call about.
      this.logger.warn(
        `content-moderation is enabled but no moderation provider is configured (${providerErrorReason(err)})`,
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
      // Described, not handed to the logger: this call is made with the
      // caller's own message, and a provider error object rendered in full
      // puts it in the log. See `describeProviderError`.
      this.logger.error(
        `Moderation provider call failed (${JSON.stringify(describeProviderError(err))})`,
      );
      return { outcome: 'error', reason: providerErrorReason(err) };
    }
  }

  private record(
    rule: ResolvedGuardrail,
    input: ApiInputGuardrailInput,
    matchCount?: number,
    score?: number,
  ): void {
    // The event's shape is `GuardrailHitService`'s, and the output window
    // writes through the same one. It was written out here, and a second copy
    // of it beside the window would have been free to spell `stage`
    // differently — at which point an operator filtering the incidents page
    // for output blocks finds only half of them.
    this.hits.record({
      rule,
      stage: 'INPUT',
      source: input.source,
      organizationId: input.organizationId,
      userId: input.userId,
      matchCount,
      score,
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
        judge: this.policyJudge.forTurn({
          organizationId: input.organizationId,
          projectId: input.projectId,
          userId: input.userId,
          trackAiUsage: input.trackAiUsage,
          apiKey: input.apiKey,
        }),
        record: ({ rule, matchCount, score }) =>
          this.record(rule, input, matchCount, score),
        onBudgetExhausted: (skipped, elapsedMs) =>
          this.logger.warn(
            `Guardrail budget exhausted after ${elapsedMs}ms; ${skipped.length} pattern rule(s) did not run for ${input.organizationId}`,
          ),
        onPolicyCapExceeded: (skipped, cap) =>
          this.logger.warn(
            `More than ${cap} policy rules are active for ${input.organizationId}; ${skipped.length} did not run`,
          ),
        // Logged, not recorded as a security event: an event says a rule
        // fired, and a rule that could not run is the opposite claim.
        onJudgeError: (rule, reason) =>
          this.logger.warn(
            `Policy rule ${rule.publicId} did not run for ${input.organizationId}: ${reason}`,
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
