'use server';

import {
  getSessionOrThrow,
  isAppAdmin,
  requireOrgAdmin,
} from '@/lib/auth-guards';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import type { AuditLogFilters } from '@/features/audit-logs/contracts/audit-log.types';
import {
  getAuditLogsQuery,
  getAuditLogFilterOptionsQuery,
} from '@/features/audit-logs/services/queries/get-audit-logs-query';

/**
 * Returns the session's orgId when the caller is an org admin (but not
 * an app admin) — those callers must only ever see their own org's logs,
 * so we force-override any client-supplied `organizationId` filter.
 * Returns `null` for app admins, who are allowed cross-org visibility.
 */
async function resolveAuditLogScope(): Promise<string | null> {
  const session = await getSessionOrThrow();
  if (isAppAdmin(session.user)) {
    return null;
  }
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    throw new Error('Unauthorized: no active organization');
  }
  await requireOrgAdmin(orgId);
  return orgId;
}

export async function getAuditLogs(filters: AuditLogFilters) {
  const scopedOrgId = await resolveAuditLogScope();
  const effectiveFilters = scopedOrgId
    ? { ...filters, organizationId: scopedOrgId }
    : filters;
  return getAuditLogsQuery(effectiveFilters);
}

export async function getAuditLogFilterOptions() {
  const scopedOrgId = await resolveAuditLogScope();
  return getAuditLogFilterOptionsQuery(
    scopedOrgId ? { organizationId: scopedOrgId } : undefined,
  );
}
