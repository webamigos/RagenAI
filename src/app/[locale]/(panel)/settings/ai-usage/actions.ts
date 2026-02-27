'use server';

import { requireAppAdmin } from '@/lib/auth-guards';
import type { AiUsageFilters } from '@/features/ai-usage/contracts/ai-usage.types';
import {
  getAiUsageDashboardQuery,
  getOrganizationsForFilterQuery,
  getProjectsForFilterQuery,
} from '@/features/ai-usage/services/queries/get-ai-usage-dashboard-query';

export async function getAiUsageDashboard(filters?: AiUsageFilters) {
  await requireAppAdmin();
  return getAiUsageDashboardQuery(filters);
}

export async function getOrganizationsForFilter() {
  await requireAppAdmin();
  return getOrganizationsForFilterQuery();
}

export async function getProjectsForFilter(orgId?: string) {
  await requireAppAdmin();
  return getProjectsForFilterQuery(orgId);
}
