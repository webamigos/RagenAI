import { Injectable } from '@nestjs/common';
import {
  securityEventTypeFor,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';

import { SecurityEventService } from '../security/security-event.service.js';

/**
 * A guardrail hit, written as a security event — once, for both stages.
 *
 * The input stage wrote this object itself, and the output window was about to
 * write a second copy of it. Two copies of "what a hit looks like in the
 * incidents table" drift, and the way they drift is invisible: an operator
 * filtering for output blocks finds the rows that happen to have been written
 * by the half that spelled `stage` the same way.
 *
 * apps/web has `recordGuardrailHit` for the same job. The two are not merged
 * because the event writers genuinely differ — a Nest service against a
 * fire-and-forget function — but the *decisions* in them are the package's:
 * `securityEventTypeFor` picks the event type and the rule carries its own
 * severity. `guardrails-are-not-recopied` is what stops either from being
 * re-decided here.
 */

export type GuardrailHit = {
  readonly rule: ResolvedGuardrail;
  /** Which stage fired, since a `BOTH` rule can fire at either. */
  readonly stage: 'INPUT' | 'OUTPUT';
  readonly source: 'api' | 'chatbot';
  readonly organizationId: string;
  readonly userId?: string | null;
  /**
   * How many spans matched. A count, never the text.
   *
   * The matched span is the caller's own message or the answer to it, and this
   * table is rendered in plain text in the admin panel.
   */
  readonly matchCount?: number;
  /**
   * The judge's 0–1 score, for a policy rule or a scored built-in.
   *
   * A number, never the judge's prose reason — that paraphrases the caller's
   * message, which is what keeps a matched span out of this event too.
   */
  readonly score?: number;
};

@Injectable()
export class GuardrailHitService {
  constructor(private readonly securityEvents: SecurityEventService) {}

  record(hit: GuardrailHit): void {
    this.securityEvents.record({
      // The mapping is the package's, so this runtime and apps/web cannot file
      // the same hit differently. No cast is needed: `SecurityEventType` has
      // carried both members since Phase A, which added them to the enum with
      // no writer precisely so every reader would have them first.
      eventType: securityEventTypeFor(hit.rule),
      // The rule's own severity, not a constant: an operator who set a rule to
      // `info` said it was noise, and overriding that makes the alerting
      // threshold unreachable.
      severity: hit.rule.severity,
      source: hit.source,
      organizationId: hit.organizationId,
      userId: hit.userId ?? null,
      metadata: {
        guardrail: hit.rule.publicId,
        rule: hit.rule.key ?? hit.rule.name,
        kind: hit.rule.kind,
        stage: hit.stage,
        action: hit.rule.action,
        ...(hit.matchCount === undefined ? {} : { matchCount: hit.matchCount }),
        ...(hit.score === undefined ? {} : { score: hit.score }),
      },
    });
  }
}
