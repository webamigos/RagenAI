'use server';

import {
  joinProjectStorage,
  type ProjectStorageSummary,
} from '@ragenai/platform-contracts';

import db from '@ragenai/prisma-client';

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

  return joinProjectStorage(
    projects,
    fileAggs.map((row) => ({
      projectId: row.projectId,
      totalBytes: row._sum.fileSize ?? 0,
      fileCount: row._count.id,
      pageCount: row._sum.pageCount ?? 0,
    })),
  );
}
