'use server';

import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import type { AiUsageFilters } from '@/features/ai-usage/contracts/ai-usage.types';
import {
  getAiUsageDashboardQuery,
  getOrganizationsForFilterQuery,
  getProjectsForFilterQuery,
} from '@/features/ai-usage/services/queries/get-ai-usage-dashboard-query';

async function requireAppAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized: app admin role required');
  }
  return user;
}

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
