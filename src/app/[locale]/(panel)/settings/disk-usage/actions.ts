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

export async function updateOrgStorageLimitAction(
  orgProviderId: string,
  storageLimitMB: number,
) {
  await requireAppAdmin();
  await saveStorageLimits(orgProviderId, {
    storageLimitBytes: storageLimitMB * 1024 * 1024,
  });
}

export async function updateOrgProjectLimitAction(
  orgProviderId: string,
  projectLimitMB: number,
) {
  await requireAppAdmin();
  await saveStorageLimits(orgProviderId, {
    projectStorageLimitBytes: projectLimitMB * 1024 * 1024,
  });
}

export async function updateOrgFileLimitAction(
  orgProviderId: string,
  fileLimitMB: number,
) {
  await requireAppAdmin();
  await saveStorageLimits(orgProviderId, {
    singleFileLimitBytes: fileLimitMB * 1024 * 1024,
  });
}
