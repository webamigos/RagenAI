import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { getSession } from '@/lib/auth-guards';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { stripSensitiveFields } from '@ragenai/platform-contracts';

/**
 * Redaction lives in `@ragenai/platform-contracts` (ADR-33) because apps/admin
 * writes audit rows too, and a second copy of the field list would go stale in
 * the direction that matters: a new credential column redacted in one app and
 * not the other.
 */

type TrackAuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
};

async function resolveAuditContext() {
  const [session, orgId] = await Promise.all([
    getSession(),
    getOrgIdFromAuth(),
  ]);

  const userId = session?.user?.id ?? null;
  // When an app admin impersonates a user, Better Auth sets impersonatedBy
  // on the session. We record the real actor (admin) in newData for traceability.
  const impersonatedBy = (
    session?.session as Record<string, unknown> | undefined
  )?.impersonatedBy as string | null | undefined;

  return { orgId, userId, impersonatedBy: impersonatedBy ?? null };
}

async function logAudit(input: TrackAuditInput) {
  const ctx = await resolveAuditContext();

  if (!ctx.orgId) {
    logger.warn(
      { audit: input.action },
      'Skipping audit log: no organization context',
    );
    return;
  }

  const newData = input.newData ?? {};
  const dataWithImpersonation = ctx.impersonatedBy
    ? { ...newData, _impersonatedBy: ctx.impersonatedBy }
    : newData;

  await db.auditLog.create({
    data: {
      organizationId: ctx.orgId,
      userId: ctx.userId,
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

/**
 * Fire-and-forget audit logger. Resolves orgId, userId, and impersonation
 * context from the current session automatically.
 *
 * Use this in commands where audit logging should never break the main flow.
 */
export function trackAudit(input: TrackAuditInput) {
  logAudit(input).catch((error) => {
    logger.error(
      { err: error, audit: input.action },
      'Failed to write audit log',
    );
  });
}
