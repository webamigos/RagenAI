import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Prisma } from '../generated/prisma/client.js';
import { type TrackAuditInput } from './types.js';

const SENSITIVE_FIELDS = new Set([
  'password',
  'token',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
  'hashedValue',
  'maskedValue',
  'codeVerifier',
  'clientSecret',
  'openaiApiKey',
  'anthropicApiKey',
  'googleApiKey',
  'bedrockCredentials',
  'openrouterApiKey',
  'fireworksApiKey',
  'azureOpenaiCredentials',
]);

function stripSensitiveFields(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!data) {
    return null;
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.has(key)) {
      cleaned[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripSensitiveFields(item as Record<string, unknown>)
          : item,
      );
    } else if (value && typeof value === 'object') {
      cleaned[key] = stripSensitiveFields(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Ported from ragen-app's
 * src/features/audit-logs/services/commands/create-audit-log-command.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Deviation: the original's `resolveAuditContext()` derived `orgId`,
 * `userId`, and Better-Auth `impersonatedBy` from the current session
 * internally (`getSession()`/`getOrgIdFromAuth()`, both Next.js-specific).
 * Those are now explicit fields on `TrackAuditInput` — every caller in
 * apps/api already has `orgId`/`userId` from its own params, so there's
 * no session to derive them from here. `impersonatedBy` is optional and
 * simply omitted when the caller doesn't have it.
 *
 * Fire-and-forget: `track()` never throws back to the caller and never
 * blocks the request path — call it without awaiting, same as the
 * original's `trackAudit(...)` and this codebase's other fire-and-forget
 * trackers (`AiUsageService.track`, `SecurityEventService.record`).
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  track(input: TrackAuditInput): void {
    void this.logAudit(input).catch((error: unknown) => {
      this.logger.error(
        `Failed to write audit log (action=${input.action})`,
        error,
      );
    });
  }

  private async logAudit(input: TrackAuditInput): Promise<void> {
    if (!input.orgId) {
      this.logger.warn(
        `Skipping audit log: no organization context (action=${input.action})`,
      );
      return;
    }

    const newData = input.newData ?? {};
    const dataWithImpersonation = input.impersonatedBy
      ? { ...newData, _impersonatedBy: input.impersonatedBy }
      : newData;

    await this.prisma.client.auditLog.create({
      data: {
        organizationId: input.orgId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        oldData: (stripSensitiveFields(input.oldData) ?? undefined) as
          Prisma.InputJsonValue | undefined,
        newData: (stripSensitiveFields(
          Object.keys(dataWithImpersonation).length > 0
            ? dataWithImpersonation
            : null,
        ) ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
