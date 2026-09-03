'use server';

import { requireOrgAdminOrAppAdmin } from '@/lib/auth-guards';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import type { AuditLogFilters } from '@/features/audit-logs/contracts/audit-log.types';
import {
  getAuditLogsQuery,
  getAuditLogFilterOptionsQuery,
} from '@/features/audit-logs/services/queries/get-audit-logs-query';

/**
 * The caller's own organization, always.
 *
 * This used to return `null` for a platform administrator, which unscoped the
 * query and turned a per-organization page into a cross-organization one.
 * Under ADR-35 that read belongs to apps/admin, which has it as **Activity
 * Log** — with filters, CSV export and the panel's own audit entries, none of
 * which this page had.
 *
 * A platform administrator reaching this page is looking at *this*
 * organization, the same as its own admins, and the client-supplied
 * `organizationId` filter is overridden rather than trusted. They reach it
 * without a membership — the `/organization/*` layout admits them, and
 * `requireOrgAdminOrAppAdmin` is what keeps this action agreeing with it.
 */
async function resolveAuditLogScope(): Promise<string> {
  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    throw new Error('Unauthorized: no active organization');
  }
  await requireOrgAdminOrAppAdmin(orgId);
  return orgId;
}

export async function getAuditLogs(filters: AuditLogFilters) {
  const scopedOrgId = await resolveAuditLogScope();
  return getAuditLogsQuery({ ...filters, organizationId: scopedOrgId });
}

export async function getAuditLogFilterOptions() {
  const scopedOrgId = await resolveAuditLogScope();
  return getAuditLogFilterOptionsQuery({ organizationId: scopedOrgId });
}
