import { StorageUsageService } from './storage-usage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('StorageUsageService', () => {
  function makeService(aggregateResults: unknown[]) {
    const aggregate = jest.fn();
    aggregateResults.forEach((r) => aggregate.mockResolvedValueOnce(r));
    const prisma = {
      client: { userFile: { aggregate } },
    } as unknown as PrismaService;
    return { service: new StorageUsageService(prisma), aggregate };
  }

  describe('getStorageUsage', () => {
    it('splits total usage into knowledge-base / thread / project buckets', async () => {
      const { service } = makeService([
        { _sum: { fileSize: 1000, pageCount: 10 }, _count: { id: 5 } }, // total
        { _sum: { fileSize: 300, pageCount: 3 }, _count: { id: 2 } }, // kb
        { _sum: { fileSize: 200, pageCount: 2 }, _count: { id: 1 } }, // thread
      ]);

      const result = await service.getStorageUsage('org-1');

      expect(result).toEqual({
        knowledgeBaseBytes: 300,
        knowledgeBaseFileCount: 2,
        knowledgeBasePageCount: 3,
        threadFilesBytes: 200,
        threadFilesFileCount: 1,
        threadFilesPageCount: 2,
        projectFilesBytes: 500,
        projectFilesFileCount: 2,
        projectFilesPageCount: 5,
        totalBytes: 1000,
        totalFileCount: 5,
        totalPageCount: 10,
      });
    });

    it('defaults to zero when there are no files', async () => {
      const empty = {
        _sum: { fileSize: null, pageCount: null },
        _count: { id: 0 },
      };
      const { service } = makeService([empty, empty, empty]);

      const result = await service.getStorageUsage('org-1');

      expect(result.totalBytes).toBe(0);
      expect(result.projectFilesBytes).toBe(0);
    });

    it('clamps project usage at zero when kb+thread would exceed total (defensive)', async () => {
      const { service } = makeService([
        { _sum: { fileSize: 100, pageCount: 1 }, _count: { id: 1 } }, // total
        { _sum: { fileSize: 80, pageCount: 1 }, _count: { id: 1 } }, // kb
        { _sum: { fileSize: 80, pageCount: 1 }, _count: { id: 1 } }, // thread
      ]);

      const result = await service.getStorageUsage('org-1');

      expect(result.projectFilesBytes).toBe(0);
      expect(result.projectFilesFileCount).toBe(0);
    });
  });

  describe('getProjectStorageUsage', () => {
    it('returns totals scoped to the org+project aggregate', async () => {
      const { service, aggregate } = makeService([
        { _sum: { fileSize: 500, pageCount: 4 }, _count: { id: 3 } },
      ]);

      const result = await service.getProjectStorageUsage('org-1', 'proj-1');

      expect(aggregate).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', projectId: 'proj-1' },
        _sum: { fileSize: true, pageCount: true },
        _count: { id: true },
      });
      expect(result).toEqual({ totalBytes: 500, fileCount: 3, pageCount: 4 });
    });
  });
});
