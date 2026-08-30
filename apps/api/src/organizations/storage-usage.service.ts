import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type StorageUsage } from './types.js';

/**
 * Ported from ragen-app's
 * src/features/organizations/services/queries/get-storage-usage-query.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class StorageUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getStorageUsage(organizationId: string): Promise<StorageUsage> {
    const [totalAgg, kbAgg, threadAgg] = await Promise.all([
      this.prisma.client.userFile.aggregate({
        where: { organizationId },
        _sum: { fileSize: true, pageCount: true },
        _count: { id: true },
      }),
      // Knowledge Base: files not assigned to any project and not attached to threads
      this.prisma.client.userFile.aggregate({
        where: {
          organizationId,
          projectId: null,
          threadDocuments: { none: {} },
        },
        _sum: { fileSize: true, pageCount: true },
        _count: { id: true },
      }),
      // Thread files: files attached to at least one thread
      this.prisma.client.userFile.aggregate({
        where: {
          organizationId,
          threadDocuments: { some: {} },
        },
        _sum: { fileSize: true, pageCount: true },
        _count: { id: true },
      }),
    ]);

    const totalBytes = totalAgg._sum.fileSize ?? 0;
    const totalFileCount = totalAgg._count.id;
    const totalPageCount = totalAgg._sum.pageCount ?? 0;
    const kbBytes = kbAgg._sum.fileSize ?? 0;
    const kbFileCount = kbAgg._count.id;
    const kbPageCount = kbAgg._sum.pageCount ?? 0;
    const threadBytes = threadAgg._sum.fileSize ?? 0;
    const threadFileCount = threadAgg._count.id;
    const threadPageCount = threadAgg._sum.pageCount ?? 0;
    // Project files: everything else (has projectId, regardless of thread status)
    const projectFilesBytes = Math.max(0, totalBytes - kbBytes - threadBytes);
    const projectFilesFileCount = Math.max(
      0,
      totalFileCount - kbFileCount - threadFileCount,
    );
    const projectFilesPageCount = Math.max(
      0,
      totalPageCount - kbPageCount - threadPageCount,
    );

    return {
      knowledgeBaseBytes: kbBytes,
      knowledgeBaseFileCount: kbFileCount,
      knowledgeBasePageCount: kbPageCount,
      projectFilesBytes,
      projectFilesFileCount,
      projectFilesPageCount,
      threadFilesBytes: threadBytes,
      threadFilesFileCount: threadFileCount,
      threadFilesPageCount: threadPageCount,
      totalBytes,
      totalFileCount,
      totalPageCount,
    };
  }

  async getProjectStorageUsage(
    organizationId: string,
    projectId: string,
  ): Promise<{ totalBytes: number; fileCount: number; pageCount: number }> {
    const agg = await this.prisma.client.userFile.aggregate({
      where: { organizationId, projectId },
      _sum: { fileSize: true, pageCount: true },
      _count: { id: true },
    });

    return {
      totalBytes: agg._sum.fileSize ?? 0,
      fileCount: agg._count.id,
      pageCount: agg._sum.pageCount ?? 0,
    };
  }
}
