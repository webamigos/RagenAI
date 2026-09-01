'use server';

import db from '@ragenai/prisma-client';
import type {
  OrgStorageSummary,
  ProjectStorageSummary,
} from '../../contracts/organization.types';

/**
 * Admin-only: get storage usage across all organizations
 */
export async function getAdminAllOrgsStorageQuery(): Promise<
  OrgStorageSummary[]
> {
  const [orgs, fileAggs] = await Promise.all([
    db.organization.findMany({
      select: {
        id: true,
        name: true,
        settings: {
          select: { storageLimitBytes: true },
        },
      },
    }),
    db.userFile.groupBy({
      by: ['organizationId'],
      _sum: { fileSize: true, pageCount: true },
      _count: { id: true },
    }),
  ]);

  const usageMap = new Map(
    fileAggs.map((a) => [
      a.organizationId,
      {
        totalBytes: a._sum.fileSize ?? 0,
        fileCount: a._count.id,
        pageCount: a._sum.pageCount ?? 0,
      },
    ]),
  );

  const results: OrgStorageSummary[] = orgs.map((org) => {
    const usage = usageMap.get(org.id) ?? {
      totalBytes: 0,
      fileCount: 0,
      pageCount: 0,
    };
    return {
      orgId: org.id,
      orgName: org.name,
      totalBytes: usage.totalBytes,
      fileCount: usage.fileCount,
      pageCount: usage.pageCount,
      storageLimitBytes:
        org.settings?.storageLimitBytes != null
          ? Number(org.settings.storageLimitBytes)
          : null,
    };
  });

  return results.sort((a, b) => b.totalBytes - a.totalBytes);
}

/**
 * Admin-only: get per-project breakdown for an organization
 */
export async function getAdminOrgProjectsStorageQuery(
  orgId: string,
): Promise<ProjectStorageSummary[]> {
  const [projects, fileAggs] = await Promise.all([
    db.project.findMany({
      where: { organizationId: orgId },
      select: { id: true, title: true },
    }),
    db.userFile.groupBy({
      by: ['projectId'],
      where: { organizationId: orgId },
      _sum: { fileSize: true, pageCount: true },
      _count: { id: true },
    }),
  ]);

  const usageMap = new Map(
    fileAggs.map((a) => [
      a.projectId,
      {
        totalBytes: a._sum.fileSize ?? 0,
        fileCount: a._count.id,
        pageCount: a._sum.pageCount ?? 0,
      },
    ]),
  );

  const results: ProjectStorageSummary[] = projects.map((project) => {
    const usage = usageMap.get(project.id) ?? {
      totalBytes: 0,
      fileCount: 0,
      pageCount: 0,
    };
    return {
      projectId: project.id,
      projectTitle: project.title,
      totalBytes: usage.totalBytes,
      fileCount: usage.fileCount,
      pageCount: usage.pageCount,
    };
  });

  return results.sort((a, b) => b.totalBytes - a.totalBytes);
}
