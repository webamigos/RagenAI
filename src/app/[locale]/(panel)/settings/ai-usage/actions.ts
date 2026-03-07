'use server';

import {
  requireAppAdmin,
  getSessionOrThrow,
  getActiveMember,
  isAppAdmin,
  isOrgAdmin,
} from '@/lib/auth-guards';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import type { AiUsageFilters } from '@/features/ai-usage/contracts/ai-usage.types';
import {
  getAiUsageDashboardQuery,
  getOrganizationsForFilterQuery,
  getProjectsForFilterQuery,
  getUsersForFilterQuery,
} from '@/features/ai-usage/services/queries/get-ai-usage-dashboard-query';
import { checkUsageLimitsQuery } from '@/features/ai-usage/services/queries/check-usage-limits-query';
import {
  saveUsageLimits,
  getUsageLimits,
  getDefaultOrganizationLimits,
  saveDefaultOrganizationLimits,
} from '@/features/organizations/services/organization-settings';
import type {
  UsageLimits,
  DefaultOrganizationLimits,
} from '@/features/organizations/contracts/organization.types';

/**
 * Ensures the caller is an app admin or org admin.
 * Returns { isAppAdmin, orgId } for scoping queries.
 */
async function requireUsageAccess(): Promise<{
  isAppAdmin: boolean;
  orgId: string;
}> {
  const session = await getSessionOrThrow();
  const userIsAppAdmin = isAppAdmin(session.user);

  if (userIsAppAdmin) {
    // App admins can view all — orgId is optional for them
    // We still return an orgId for context but it won't restrict queries
    const orgId = await getOrgIdFromAuthOrThrow();
    return { isAppAdmin: true, orgId };
  }

  const orgId = await getOrgIdFromAuthOrThrow();
  const member = await getActiveMember(orgId);
  if (!member || !isOrgAdmin(member.role)) {
    throw new Error('Unauthorized: admin access required');
  }
  return { isAppAdmin: false, orgId };
}

export async function getAiUsageDashboard(filters?: AiUsageFilters) {
  const access = await requireUsageAccess();

  // Org admins can only see their own org
  const scopedFilters: AiUsageFilters = {
    ...filters,
    ...(!access.isAppAdmin ? { organizationId: access.orgId } : {}),
  };

  return getAiUsageDashboardQuery(scopedFilters);
}

export async function getOrganizationsForFilter() {
  await requireAppAdmin();
  return getOrganizationsForFilterQuery();
}

export async function getProjectsForFilter(orgId?: string) {
  const access = await requireUsageAccess();
  const scopedOrgId = access.isAppAdmin ? orgId : access.orgId;
  return getProjectsForFilterQuery(scopedOrgId);
}

export async function getUsersForFilter(orgId?: string) {
  const access = await requireUsageAccess();
  const scopedOrgId = access.isAppAdmin ? orgId : access.orgId;
  return getUsersForFilterQuery(scopedOrgId);
}

export async function getOrgUsageLimitsAction(orgId: string) {
  await requireAppAdmin();
  const [limits, status] = await Promise.all([
    getUsageLimits(orgId),
    checkUsageLimitsQuery(orgId),
  ]);
  return { limits, current: status.current, exceeded: status.exceeded };
}

export async function updateOrgUsageLimitsAction(
  orgId: string,
  limits: Partial<UsageLimits>,
) {
  await requireAppAdmin();
  await saveUsageLimits(orgId, limits);
}

export async function getDefaultLimitsAction() {
  await requireAppAdmin();
  return getDefaultOrganizationLimits();
}

export async function updateDefaultLimitsAction(
  limits: Partial<DefaultOrganizationLimits>,
) {
  await requireAppAdmin();
  await saveDefaultOrganizationLimits(limits);
}
