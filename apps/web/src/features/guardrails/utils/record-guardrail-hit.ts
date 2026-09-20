import {
  securityEventTypeFor,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';

import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';
import type {
  SecurityEventSource,
  SecurityEventType,
} from '@/features/security/contracts/security-event.types';

/**
 * A guardrail hit, written as a security event.
 *
 * Thin by design, and tested anyway: per `AGENTS.md`, a small file that is the
 * only place a piece of wiring exists is exactly where a mistake fails
 * silently. Three things could go wrong here and none of them would throw —
 * the wrong event type for the action, the matched text ending up in the
 * event, or the rule's configured severity being ignored in favour of a
 * constant. Each has a test.
 */

export type GuardrailHit = {
  readonly rule: ResolvedGuardrail;
  readonly organizationId: string;
  readonly userId?: string | null;
  readonly source: SecurityEventSource;
  /** Which stage fired, since a `BOTH` rule can fire at either. */
  readonly stage: 'INPUT' | 'OUTPUT';
  /**
   * How many spans matched. A count, never the text.
   *
   * The matched span is the user's message, which is the thing the rest of
   * this product encrypts per organization (ADR-06) and scrubs before it
   * reaches a log. An event carrying it would put customer content into a
   * table the admin panel renders in plain text, for every operator, on the
   * grounds that it was convenient for debugging. The rule and the count are
   * enough to tell a false positive from a real one; the message itself is in
   * the thread, where its owner can see it and the platform cannot.
   */
  readonly matchCount?: number;
  /**
   * The judge's 0–1 score, for a policy rule or a scored built-in.
   *
   * A number, and never the judge's prose reason. The reason paraphrases the
   * customer's message, and the rule that keeps a matched span out of this
   * event is the same rule: the message is in the thread, where its owner can
   * see it and the platform cannot. The score is what tells a false positive
   * from a real one, and what tells an operator where to put the threshold.
   */
  readonly score?: number;
};

/**
 * The action-to-event mapping is the package's, not this app's.
 *
 * It was written here and again in apps/api, and two copies drift into the
 * same hit being filed under different event types depending on which surface
 * it arrived through.
 */
export function eventTypeFor(rule: ResolvedGuardrail): SecurityEventType {
  return securityEventTypeFor(rule) as SecurityEventType;
}

/**
 * Fire and forget, like every other producer of these events.
 *
 * Never awaited: `recordSecurityEvent` writes to the database, sends mail on a
 * critical severity, and swallows its own failures. Awaiting it would put all
 * of that on the turn's critical path — and a guardrail that makes chat slower
 * when the mailer is slow is a guardrail people switch off.
 */
export function recordGuardrailHit(hit: GuardrailHit): void {
  recordSecurityEvent({
    eventType: eventTypeFor(hit.rule),
    // The rule's own severity, not a constant. An operator who set a rule to
    // `info` said it was noise; overriding that here would make the alerting
    // threshold unreachable and the page unreadable.
    severity: hit.rule.severity,
    source: hit.source,
    organizationId: hit.organizationId,
    userId: hit.userId ?? null,
    metadata: {
      guardrail: hit.rule.publicId,
      // The key for a built-in, the name for an operator's own rule. A name is
      // editable, so it cannot be the identifier — but for a rule somebody
      // wrote themselves it is the only human-readable handle there is.
      rule: hit.rule.key ?? hit.rule.name,
      kind: hit.rule.kind,
      stage: hit.stage,
      action: hit.rule.action,
      ...(hit.matchCount === undefined ? {} : { matchCount: hit.matchCount }),
      ...(hit.score === undefined ? {} : { score: hit.score }),
    },
  });
}
