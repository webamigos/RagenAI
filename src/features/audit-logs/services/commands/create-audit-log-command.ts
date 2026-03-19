import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

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
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = stripSensitiveFields(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

type LogAuditInput = {
  orgId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
};

export async function logAudit(input: LogAuditInput) {
  await db.auditLog.create({
    data: {
      organizationId: input.orgId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldData: (stripSensitiveFields(input.oldData) ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      newData: (stripSensitiveFields(input.newData) ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
    },
  });
}

/**
 * Fire-and-forget wrapper — swallows errors and logs them.
 * Use this in commands where audit logging should never break the main flow.
 */
export function trackAudit(input: LogAuditInput) {
  logAudit(input).catch((error) => {
    logger.error(
      { err: error, audit: input.action },
      'Failed to write audit log',
    );
  });
}
