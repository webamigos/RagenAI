'use server';

import { requireAppAdmin } from '@/lib/auth-guards';
import type { AuditLogFilters } from '@/features/audit-logs/contracts/audit-log.types';
import {
  getAuditLogsQuery,
  getAuditLogFilterOptionsQuery,
} from '@/features/audit-logs/services/queries/get-audit-logs-query';

export async function getAuditLogs(filters: AuditLogFilters) {
  await requireAppAdmin();
  return getAuditLogsQuery(filters);
}

export async function getAuditLogFilterOptions() {
  await requireAppAdmin();
  return getAuditLogFilterOptionsQuery();
}
