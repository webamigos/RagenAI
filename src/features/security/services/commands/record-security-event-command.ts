import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { scrubPii } from '../../utils/pii-scrubber';
import { getEscalationRule } from '../../utils/escalation-rules';
import { meetsAlertSeverityThreshold } from '../../utils/severity-threshold';
import type {
  RecordSecurityEventInput,
  SecurityEventSeverity,
} from '../../contracts/security-event.types';

/**
 * Record a security event. Fire-and-forget: never throws back to the caller,
 * never blocks the request path. Side effects:
 *
 * 1. PII scrub on `metadata` (defense-in-depth — producers should already
 *    send sparse metadata).
 * 2. Burst-detection escalation: if the same `(userId, eventType)` has
 *    fired above the configured threshold in the recent window, upgrade
 *    severity to `critical` regardless of what the caller passed.
 * 3. Insert into `security_events`.
 * 4. Mirror to Pino with `audit: true` tag so existing log-based
 *    observability picks it up.
 * 5. If the resolved severity is `critical`, dispatch an email alert
 *    (fire-and-forget, dedupe + rate cap applied inside the mailer).
 *
 * Never await this from a hot path — use `recordSecurityEvent(...)` without
 * `await` so a failing sink cannot stall the originating request.
 */
export function recordSecurityEvent(input: RecordSecurityEventInput): void {
  void runRecordPipeline(input).catch((err) => {
    logger.error(
      { err, eventType: input.eventType },
      'Failed to record security event',
    );
  });
}

async function runRecordPipeline(
  input: RecordSecurityEventInput,
): Promise<void> {
  const scrubbedMetadata = scrubPii(input.metadata ?? null);
  const effectiveSeverity = await resolveSeverity(input);

  const event = await db.securityEvent.create({
    data: {
      eventType: input.eventType,
      severity: effectiveSeverity,
      source: input.source,
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      metadata: scrubbedMetadata as Prisma.InputJsonValue,
    },
  });

  logger.warn(
    {
      audit: true,
      securityEventId: event.publicId,
      eventType: event.eventType,
      severity: event.severity,
      source: event.source,
      organizationId: event.organizationId,
      userId: event.userId,
      requestId: event.requestId,
    },
    'Security event recorded',
  );

  // Severity gate for email dispatch. Default threshold is `critical` but
  // operators can lower it to `warn` or `info` via SECURITY_ALERT_SEVERITY.
  // Below-threshold events still land in the DB and admin UI — just no email.
  if (meetsAlertSeverityThreshold(effectiveSeverity)) {
    // Dynamic import avoids pulling Resend + React Email into edge-runtime
    // callers (middleware, auth hooks) and mirrors how src/lib/auth.ts
    // imports the mailer to dodge webpack bundling issues.
    try {
      const { sendSecurityAlertEmail } =
        await import('@/app/emails/services/mailer');
      await sendSecurityAlertEmail({
        event: {
          publicId: event.publicId,
          eventType: event.eventType,
          severity: event.severity,
          source: event.source,
          organizationId: event.organizationId,
          userId: event.userId,
          ipAddress: event.ipAddress,
          requestId: event.requestId,
          createdAt: event.createdAt,
        },
      });
    } catch (err) {
      logger.error(
        { err, securityEventId: event.publicId },
        'Failed to dispatch security alert email',
      );
    }
  }
}

async function resolveSeverity(
  input: RecordSecurityEventInput,
): Promise<SecurityEventSeverity> {
  const rule = getEscalationRule(input.eventType);
  if (!rule || input.severity === 'critical') {
    return input.severity;
  }

  // Escalation needs at least one actor bucket (userId or ipAddress).
  // Without either we'd aggregate every unknown attacker into one global
  // bucket and spam admins, so we skip escalation on pre-auth events that
  // carry no forensic context at all.
  if (!input.userId && !input.ipAddress) {
    return input.severity;
  }

  const since = new Date(Date.now() - rule.windowMinutes * 60 * 1000);

  // When both identifiers are present, check them independently. This
  // closes the "switch account from same IP" evasion — an attacker that
  // rotates userIds from a single IP still trips the IP bucket, and an
  // attacker that rotates IPs on one account still trips the user bucket.
  const [byUser, byIp] = await Promise.all([
    input.userId
      ? db.securityEvent.count({
          where: {
            eventType: input.eventType,
            createdAt: { gte: since },
            userId: input.userId,
          },
        })
      : Promise.resolve(0),
    input.ipAddress
      ? db.securityEvent.count({
          where: {
            eventType: input.eventType,
            createdAt: { gte: since },
            ipAddress: input.ipAddress,
          },
        })
      : Promise.resolve(0),
  ]);

  const maxCount = Math.max(byUser, byIp);
  if (maxCount + 1 >= rule.threshold) {
    return 'critical';
  }
  return input.severity;
}
