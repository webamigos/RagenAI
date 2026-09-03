'use server';

import {
  joinOrgStorage,
  joinProjectStorage,
  type ProjectStorageSummary,
} from '@ragenai/platform-contracts';

import db from '@ragenai/prisma-client';

/**
 * Storage usage across every organization.
 *
 * The join, the zero-filling and the usage percentage come from
 * `@ragenai/platform-contracts` (ADR-35), because apps/admin's own disk-usage
 * page did the same work separately — and differently: it asked for
 * `_count: true` where this asked for `_count: { id: true }`, and only it
 * computed a percentage.
 *
 * **This function is itself an open ADR-35 question.** A cross-organization
 * read belongs to apps/admin; it lives here because the disk-usage page has
 * an `isAppAdmin` branch left from when apps/admin did not exist. Sharing the
 * arithmetic is the safe half of that cleanup; removing the branch deletes
 * customer-facing UI and wants its own change.
 */
export async function getAdminAllOrgsStorageQuery() {
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

  return joinOrgStorage(
    orgs.map((org) => ({
      id: org.id,
      name: org.name,
      storageLimitBytes: org.settings?.storageLimitBytes ?? null,
    })),
    fileAggs.map((row) => ({
      organizationId: row.organizationId,
      totalBytes: row._sum.fileSize ?? 0,
      fileCount: row._count.id,
      pageCount: row._sum.pageCount ?? 0,
    })),
  );
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
