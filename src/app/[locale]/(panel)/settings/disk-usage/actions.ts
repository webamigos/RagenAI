'use server';

import {
  requireAppAdmin,
  getSessionOrThrow,
  getActiveMember,
  isAppAdmin,
  isOrgAdmin,
} from '@/lib/auth-guards';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
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
import db from '@ragenai/prisma-client';

/**
 * Ensures the caller is an app admin or org admin.
 * Returns { isAppAdmin, orgId } for scoping queries.
 */
async function requireStorageAccess(): Promise<{
  isAppAdmin: boolean;
  orgId: string;
}> {
  const session = await getSessionOrThrow();
  const userIsAppAdmin = isAppAdmin(session.user);

  if (userIsAppAdmin) {
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

export async function getAdminStorageOverview() {
  const access = await requireStorageAccess();

  if (access.isAppAdmin) {
    return getAdminAllOrgsStorageQuery();
  }

  // Org admin: return only their own org
  const [usage, limits] = await Promise.all([
    getStorageUsageQuery(access.orgId),
    getStorageLimitsByOrgId(access.orgId),
  ]);

  const org = await db.organization.findUnique({
    where: { id: access.orgId },
    select: { name: true },
  });

  return [
    {
      orgId: access.orgId,
      orgName: org?.name ?? 'My Organization',
      totalBytes: usage.totalBytes,
      fileCount: usage.totalFileCount,
      storageLimitBytes: limits.storageLimitBytes,
    },
  ];
}

export async function getAdminOrgProjects(orgId: string) {
  const access = await requireStorageAccess();
  const scopedOrgId = access.isAppAdmin ? orgId : access.orgId;
  return getAdminOrgProjectsStorageQuery(scopedOrgId);
}

export async function getAdminOrgStorageDetails(orgId: string) {
  const access = await requireStorageAccess();
  const scopedOrgId = access.isAppAdmin ? orgId : access.orgId;

  const [usage, limits] = await Promise.all([
    getStorageUsageQuery(scopedOrgId),
    getStorageLimitsByOrgId(scopedOrgId),
  ]);

  return { usage, limits };
}

export async function getDiskOrganizationsForFilter() {
  await requireAppAdmin();
  return getOrganizationsForFilterQuery();
}

export async function getDiskProjectsForFilter(orgId?: string) {
  const access = await requireStorageAccess();
  const scopedOrgId = access.isAppAdmin ? orgId : access.orgId;
  return getProjectsForFilterQuery(scopedOrgId);
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
