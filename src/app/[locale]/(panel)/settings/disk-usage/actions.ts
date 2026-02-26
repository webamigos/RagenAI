'use server';

import db from '@ragenai/prisma-client';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { saveStorageLimits } from '@/features/organizations/services/organization-settings';
import {
  getAdminAllOrgsStorageQuery,
  getAdminOrgProjectsStorageQuery,
} from '@/features/organizations/services/queries/get-admin-storage-query';
import { getStorageUsageQuery } from '@/features/organizations/services/queries/get-storage-usage-query';
import { getStorageLimitsByInternalOrgId } from '@/features/organizations/services/organization-settings';

async function requireAppAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized: app admin role required');
  }
  return user;
}

export async function getAdminStorageOverview() {
  await requireAppAdmin();
  return getAdminAllOrgsStorageQuery();
}

export async function getAdminOrgProjects(orgProviderId: string) {
  await requireAppAdmin();
  return getAdminOrgProjectsStorageQuery(orgProviderId);
}

export async function getAdminOrgStorageDetails(orgProviderId: string) {
  await requireAppAdmin();

  const usage = await getStorageUsageQuery(orgProviderId);

  const org = await db.internalOrganization.findUnique({
    where: { provider_id: orgProviderId },
    select: { id: true },
  });

  const limits = org ? await getStorageLimitsByInternalOrgId(org.id) : null;

  return { usage, limits };
}

export async function updateOrgStorageLimitsAction(
  orgProviderId: string,
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

  await saveStorageLimits(orgProviderId, {
    storageLimitBytes: storageLimitMB * 1024 * 1024,
    projectStorageLimitBytes: projectLimitMB * 1024 * 1024,
    singleFileLimitBytes: fileLimitMB * 1024 * 1024,
  });
}
