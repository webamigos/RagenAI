import type { ResolvedGuardrail } from '@ragenai/guardrails';

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
};

/**
 * `BLOCK` is the only action that stops a turn, so it is the only one that
 * files a `GUARDRAIL_BLOCKED`.
 *
 * `MASK` is deliberately `FLAGGED` rather than a third member: something was
 * found and the turn continued, which is the same story a `LOG` rule tells.
 * Giving masking its own event type would have meant a schema change every
 * time an action is added, and the action is already on the event.
 */
export function eventTypeFor(rule: ResolvedGuardrail): SecurityEventType {
  return rule.action === 'BLOCK'
    ? ('GUARDRAIL_BLOCKED' as SecurityEventType)
    : ('GUARDRAIL_FLAGGED' as SecurityEventType);
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
    },
  });
}
