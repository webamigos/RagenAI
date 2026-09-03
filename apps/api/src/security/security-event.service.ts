import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Prisma } from '../generated/prisma/client.js';
import { scrubPii } from './pii-scrubber.js';
import { getEscalationRule } from './escalation-rules.js';
import { meetsAlertSeverityThreshold } from './severity-threshold.js';
import {
  type RecordSecurityEventInput,
  type SecurityEventSeverity,
} from './types.js';

/**
 * Ported from apps/web's
 * src/features/security/services/commands/record-security-event-command.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * KNOWN GAP vs the original: the original dispatches an email alert (via
 * src/app/emails/services/mailer, React Email + Resend) when the resolved
 * severity meets meetsAlertSeverityThreshold(). That's a Next.js-specific
 * subsystem out of scope for this slice (not part of the MCP tool-loading
 * closure) and is NOT ported here — this service inserts the row, mirrors
 * to the logger, and runs escalation, but never sends an alert email.
 * Fine while this whole path stays unwired (no controller calls it yet);
 * whoever wires this up for real should either port the mailer alongside
 * it or explicitly decide alerting stays web-only.
 *
 * Fire-and-forget: `record()` never throws back to the caller and never
 * blocks the request path — call it without awaiting, same as the
 * original's `recordSecurityEvent(...)`.
 */
@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordSecurityEventInput): void {
    void this.runRecordPipeline(input).catch((err: unknown) => {
      this.logger.error(
        `Failed to record security event (eventType=${input.eventType})`,
        err,
      );
    });
  }

  private async runRecordPipeline(
    input: RecordSecurityEventInput,
  ): Promise<void> {
    const scrubbedMetadata = scrubPii(input.metadata ?? null);
    const effectiveSeverity = await this.resolveSeverity(input);

    const event = await this.prisma.client.securityEvent.create({
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

    this.logger.warn('Security event recorded', {
      audit: true,
      securityEventId: event.publicId,
      eventType: event.eventType,
      severity: event.severity,
      source: event.source,
      organizationId: event.organizationId,
      userId: event.userId,
      requestId: event.requestId,
    });

    // See the KNOWN GAP note above — email dispatch is intentionally not
    // ported. meetsAlertSeverityThreshold is still evaluated so a future
    // caller (or test) can observe which events *would* have alerted.
    void meetsAlertSeverityThreshold(effectiveSeverity);
  }

  private async resolveSeverity(
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
        ? this.prisma.client.securityEvent.count({
            where: {
              eventType: input.eventType,
              createdAt: { gte: since },
              userId: input.userId,
            },
          })
        : Promise.resolve(0),
      input.ipAddress
        ? this.prisma.client.securityEvent.count({
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
}
