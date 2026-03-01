'use server';

import { requireAppAdmin } from '@/lib/auth-guards';
import { saveStorageLimits } from '@/features/organizations/services/organization-settings';
import {
  getAdminAllOrgsStorageQuery,
  getAdminOrgProjectsStorageQuery,
} from '@/features/organizations/services/queries/get-admin-storage-query';
import { getStorageUsageQuery } from '@/features/organizations/services/queries/get-storage-usage-query';
import { getStorageLimitsByOrgId } from '@/features/organizations/services/organization-settings';
import {
  getOrganizationsForFilterQuery,
  getProjectsForFilterQuery,
} from '@/features/ai-usage/services/queries/get-ai-usage-dashboard-query';

export async function getAdminStorageOverview() {
  await requireAppAdmin();
  return getAdminAllOrgsStorageQuery();
}

export async function getAdminOrgProjects(orgId: string) {
  await requireAppAdmin();
  return getAdminOrgProjectsStorageQuery(orgId);
}

export async function getAdminOrgStorageDetails(orgId: string) {
  await requireAppAdmin();

  const [usage, limits] = await Promise.all([
    getStorageUsageQuery(orgId),
    getStorageLimitsByOrgId(orgId),
  ]);

  return { usage, limits };
}

export async function getDiskOrganizationsForFilter() {
  await requireAppAdmin();
  return getOrganizationsForFilterQuery();
}

export async function getDiskProjectsForFilter(orgId?: string) {
  await requireAppAdmin();
  return getProjectsForFilterQuery(orgId);
}

export async function updateOrgStorageLimitsAction(
  orgId: string,
  limits: {
    storageLimitMB: number;
    projectLimitMB: number;
    fileLimitMB: number;
  },
) {
  await requireAppAdmin();

  const { storageLimitMB, projectLimitMB, fileLimitMB } = limits;

  if (
    !Number.isFinite(storageLimitMB) ||
    storageLimitMB < 1 ||
    !Number.isFinite(projectLimitMB) ||
    projectLimitMB < 1 ||
    !Number.isFinite(fileLimitMB) ||
    fileLimitMB < 1
  ) {
    throw new Error('All limits must be positive numbers (in MB)');
  }

  await saveStorageLimits(orgId, {
    storageLimitBytes: storageLimitMB * 1024 * 1024,
    projectStorageLimitBytes: projectLimitMB * 1024 * 1024,
    singleFileLimitBytes: fileLimitMB * 1024 * 1024,
  });
}
