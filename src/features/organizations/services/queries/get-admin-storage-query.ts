'use server';

import db from '@ragenai/prisma-client';
import type {
  OrgStorageSummary,
  ProjectStorageSummary,
} from '../../contracts/organization.types';

export type { OrgStorageSummary, ProjectStorageSummary };

/**
 * Admin-only: get storage usage across all organizations
 */
export async function getAdminAllOrgsStorageQuery(): Promise<
  OrgStorageSummary[]
> {
  const [orgs, betterAuthOrgs, fileAggs] = await Promise.all([
    db.internalOrganization.findMany({
      select: {
        id: true,
        provider_id: true,
        settings: {
          select: { storage_limit_bytes: true },
        },
      },
    }),
    db.organization.findMany({
      select: { id: true, name: true },
    }),
    db.userFile.groupBy({
      by: ['organization_id'],
      _sum: { file_size: true },
      _count: { id: true },
    }),
  ]);

  const orgNameMap = new Map(betterAuthOrgs.map((o) => [o.id, o.name]));
  const usageMap = new Map(
    fileAggs.map((a) => [
      a.organization_id,
      { totalBytes: a._sum.file_size ?? 0, fileCount: a._count.id },
    ]),
  );

  const results: OrgStorageSummary[] = orgs.map((org) => {
    const usage = usageMap.get(org.provider_id) ?? {
      totalBytes: 0,
      fileCount: 0,
    };
    return {
      orgId: org.provider_id,
      orgName: orgNameMap.get(org.provider_id) ?? org.provider_id,
      internalOrgId: org.id,
      totalBytes: usage.totalBytes,
      fileCount: usage.fileCount,
      storageLimitBytes: org.settings?.storage_limit_bytes
        ? Number(org.settings.storage_limit_bytes)
        : null,
    };
  });

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

  const [projects, fileAggs] = await Promise.all([
    db.project.findMany({
      where: { internal_organization_id: org.id },
      select: { id: true, public_id: true, title: true },
    }),
    db.userFile.groupBy({
      by: ['project_id'],
      where: { organization_id: orgProviderId },
      _sum: { file_size: true },
      _count: { id: true },
    }),
  ]);

  const usageMap = new Map(
    fileAggs.map((a) => [
      a.project_id,
      { totalBytes: a._sum.file_size ?? 0, fileCount: a._count.id },
    ]),
  );

  const results: ProjectStorageSummary[] = projects.map((project) => {
    const usage = usageMap.get(project.id) ?? { totalBytes: 0, fileCount: 0 };
    return {
      projectId: project.id,
      projectPublicId: project.public_id,
      projectTitle: project.title,
      totalBytes: usage.totalBytes,
      fileCount: usage.fileCount,
    };
  });

  return results.sort((a, b) => b.totalBytes - a.totalBytes);
}
