'use server';

import { requireOrgAdmin } from '@/lib/auth-guards';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import type { AiUsageFilters } from '@/features/ai-usage/contracts/ai-usage.types';
import {
  getAiUsageDashboardQuery,
  getProjectsForFilterQuery,
  getUsersForFilterQuery,
} from '@/features/ai-usage/services/queries/get-ai-usage-dashboard-query';
import {
  checkApiRequestLimit,
  type ApiLimitStatus,
} from '@/app/api/v1/check-api-limit';

/**
 * This page answers "how much does *my* organization use".
 *
 * It used to answer both questions. A platform administrator got an unscoped
 * query, an organization column, a per-organization chart and an organization
 * picker — a second copy of what apps/admin's **AI Usage** page does, inside
 * the customer application. ADR-35 puts that read in the panel, which has it
 * with filters, pagination and CSV export.
 *
 * So the scope is no longer conditional. Every query below is pinned to the
 * caller's own organization, and a client-supplied `organizationId` is
 * overridden rather than trusted — the same rule the rest of the app follows.
 */
async function requireUsageAccess(): Promise<string> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  return orgId;
}

export async function getAiUsageDashboard(filters?: AiUsageFilters) {
  const orgId = await requireUsageAccess();

  return getAiUsageDashboardQuery({ ...filters, organizationId: orgId });
}

export async function getProjectsForFilter() {
  const orgId = await requireUsageAccess();
  return getProjectsForFilterQuery(orgId);
}

export async function getUsersForFilter() {
  const orgId = await requireUsageAccess();
  return getUsersForFilterQuery(orgId);
}

export async function getApiUsageStats(): Promise<ApiLimitStatus> {
  const orgId = await requireUsageAccess();
  return checkApiRequestLimit(orgId);
}
