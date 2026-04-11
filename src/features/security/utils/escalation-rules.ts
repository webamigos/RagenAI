import type { SecurityEventType } from '@/generated/prisma/client';

/**
 * Per-event-type burst thresholds used by `recordSecurityEventCommand` to
 * upgrade `severity` to `critical` when the same (userId, eventType) fires
 * repeatedly in a short window. This is how we turn a trickle of benign
 * `info` events into a `critical` alert that pages the admin mailbox.
 *
 * A null entry means the event type does not escalate on burst (already
 * recorded at its author-provided severity).
 */
export type EscalationRule = {
  windowMinutes: number;
  threshold: number;
};

export const ESCALATION_RULES: Partial<
  Record<SecurityEventType, EscalationRule>
> = {
  AUTH_LOGIN_FAILED: { windowMinutes: 60, threshold: 10 },
  API_INTERNAL_SECRET_MISMATCH: { windowMinutes: 10, threshold: 5 },
  CROSS_ORG_ACCESS_ATTEMPTED: { windowMinutes: 30, threshold: 3 },
  UNAUTHORIZED_ACCESS_ATTEMPTED: { windowMinutes: 30, threshold: 5 },
  CHAT_JAILBREAK_DETECTED: { windowMinutes: 10, threshold: 5 },
  TOOL_ARGS_HIGH_RISK: { windowMinutes: 10, threshold: 3 },
  UPLOAD_SUSPICIOUS_CONTENT: { windowMinutes: 1440, threshold: 3 },
  RATE_LIMIT_HIT: { windowMinutes: 60, threshold: 20 },
};

export function getEscalationRule(
  eventType: SecurityEventType,
): EscalationRule | null {
  return ESCALATION_RULES[eventType] ?? null;
}
