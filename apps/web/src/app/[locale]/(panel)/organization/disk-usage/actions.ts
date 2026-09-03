'use server';

import { requireOrgAdminOrAppAdmin } from '@/lib/auth-guards';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getAdminOrgProjectsStorageQuery } from '@/features/organizations/services/queries/get-admin-storage-query';
import { getStorageUsageQuery } from '@/features/organizations/services/queries/get-storage-usage-query';
import { getStorageLimitsByOrgId } from '@/features/organizations/services/organization-settings';

/**
 * Storage for the caller's own organization.
 *
 * This page used to be two pages wearing one URL. A platform administrator got
 * every organization on the installation, an organization picker and editable
 * ceilings — a second copy of apps/admin's **Disk Usage** and **Limits**,
 * inside the customer application, written before apps/admin existed.
 *
 * ADR-35 puts those reads and that write in the panel, which has them with
 * filters, totals and CSV export. What remains here is the question this page
 * is actually for: how much has *my* organization used, and against what
 * ceiling.
 *
 * Changing a ceiling is gone from here entirely. It was `requireAppAdmin`, so
 * no organization admin could ever reach it — the control was invisible to
 * everyone it was rendered for.
 */
async function requireStorageAccess(): Promise<string> {
  const orgId = await getOrgIdFromAuthOrThrow();
  // See `requireOrgAdminOrAppAdmin`: the page admits a platform administrator
  // without a membership, so the actions behind it must too.
  await requireOrgAdminOrAppAdmin(orgId);
  return orgId;
}

export async function getOrgStorageDetails() {
  const orgId = await requireStorageAccess();

  const [usage, limits] = await Promise.all([
    getStorageUsageQuery(orgId),
    getStorageLimitsByOrgId(orgId),
  ]);

  return { usage, limits };
}

export async function getOrgProjects() {
  const orgId = await requireStorageAccess();
  return getAdminOrgProjectsStorageQuery(orgId);
}
