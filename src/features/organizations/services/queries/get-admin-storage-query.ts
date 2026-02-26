'use server';

import db from '@ragenai/prisma-client';

export type OrgStorageSummary = {
  orgId: string;
  orgName: string;
  internalOrgId: number;
  totalBytes: number;
  fileCount: number;
  storageLimitBytes: number | null;
};

export type ProjectStorageSummary = {
  projectId: number;
  projectPublicId: string;
  projectTitle: string;
  totalBytes: number;
  fileCount: number;
};

/**
 * Admin-only: get storage usage across all organizations
 */
export async function getAdminAllOrgsStorageQuery(): Promise<
  OrgStorageSummary[]
> {
  const orgs = await db.internalOrganization.findMany({
    select: {
      id: true,
      provider_id: true,
      settings: {
        select: { storage_limit_bytes: true },
      },
    },
  });

  const betterAuthOrgs = await db.organization.findMany({
    select: { id: true, name: true },
  });
  const orgNameMap = new Map(betterAuthOrgs.map((o) => [o.id, o.name]));

  const results: OrgStorageSummary[] = [];

  for (const org of orgs) {
    const agg = await db.userFile.aggregate({
      where: { organization_id: org.provider_id },
      _sum: { file_size: true },
      _count: { id: true },
    });

    results.push({
      orgId: org.provider_id,
      orgName: orgNameMap.get(org.provider_id) ?? org.provider_id,
      internalOrgId: org.id,
      totalBytes: agg._sum.file_size ?? 0,
      fileCount: agg._count.id,
      storageLimitBytes: org.settings?.storage_limit_bytes
        ? Number(org.settings.storage_limit_bytes)
        : null,
    });
  }

  return results.sort((a, b) => b.totalBytes - a.totalBytes);
}

/**
 * Admin-only: get per-project breakdown for an organization
 */
export async function getAdminOrgProjectsStorageQuery(
  orgProviderId: string,
): Promise<ProjectStorageSummary[]> {
  const org = await db.internalOrganization.findUnique({
    where: { provider_id: orgProviderId },
    select: { id: true },
  });

  if (!org) return [];

  const projects = await db.project.findMany({
    where: { internal_organization_id: org.id },
    select: { id: true, public_id: true, title: true },
  });

  const results: ProjectStorageSummary[] = [];

  for (const project of projects) {
    const agg = await db.userFile.aggregate({
      where: {
        organization_id: orgProviderId,
        project_id: project.id,
      },
      _sum: { file_size: true },
      _count: { id: true },
    });

    results.push({
      projectId: project.id,
      projectPublicId: project.public_id,
      projectTitle: project.title,
      totalBytes: agg._sum.file_size ?? 0,
      fileCount: agg._count.id,
    });
  }

  return results.sort((a, b) => b.totalBytes - a.totalBytes);
}
