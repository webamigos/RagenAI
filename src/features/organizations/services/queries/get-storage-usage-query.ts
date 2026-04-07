import db from '@ragenai/prisma-client';
import type { StorageUsage } from '../../contracts/organization.types';

export async function getStorageUsageQuery(
  organizationId: string,
): Promise<StorageUsage> {
  const [totalAgg, kbAgg, threadAgg] = await Promise.all([
    db.userFile.aggregate({
      where: { organizationId: organizationId },
      _sum: { fileSize: true },
      _count: { id: true },
    }),
    // Knowledge Base: files not assigned to any project and not attached to threads
    db.userFile.aggregate({
      where: {
        organizationId: organizationId,
        projectId: null,
        threadDocuments: { none: {} },
      },
      _sum: { fileSize: true },
      _count: { id: true },
    }),
    // Thread files: files attached to at least one thread
    db.userFile.aggregate({
      where: {
        organizationId: organizationId,
        threadDocuments: { some: {} },
      },
      _sum: { fileSize: true },
      _count: { id: true },
    }),
  ]);

  const totalBytes = totalAgg._sum.fileSize ?? 0;
  const totalFileCount = totalAgg._count.id;
  const kbBytes = kbAgg._sum.fileSize ?? 0;
  const kbFileCount = kbAgg._count.id;
  const threadBytes = threadAgg._sum.fileSize ?? 0;
  const threadFileCount = threadAgg._count.id;
  // Project files: everything else (has projectId, regardless of thread status)
  const projectFilesBytes = Math.max(0, totalBytes - kbBytes - threadBytes);
  const projectFilesFileCount = Math.max(
    0,
    totalFileCount - kbFileCount - threadFileCount,
  );

  return {
    knowledgeBaseBytes: kbBytes,
    knowledgeBaseFileCount: kbFileCount,
    projectFilesBytes,
    projectFilesFileCount,
    threadFilesBytes: threadBytes,
    threadFilesFileCount: threadFileCount,
    totalBytes,
    totalFileCount,
  };
}

/**
 * Get storage usage for a specific project
 */
export async function getProjectStorageUsageQuery(
  organizationId: string,
  projectId: string,
): Promise<{ totalBytes: number; fileCount: number }> {
  const agg = await db.userFile.aggregate({
    where: { organizationId: organizationId, projectId: projectId },
    _sum: { fileSize: true },
    _count: { id: true },
  });

  return {
    totalBytes: agg._sum.fileSize ?? 0,
    fileCount: agg._count.id,
  };
}
