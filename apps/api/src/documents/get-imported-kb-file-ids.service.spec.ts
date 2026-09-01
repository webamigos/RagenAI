import { GetImportedKbFileIdsService } from './get-imported-kb-file-ids.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('GetImportedKbFileIdsService', () => {
  function makeService(findManyResult: unknown[]) {
    const findMany = jest.fn().mockResolvedValue(findManyResult);
    const prisma = {
      client: { userFile: { findMany } },
    } as unknown as PrismaService;
    return { service: new GetImportedKbFileIdsService(prisma), findMany };
  }

  it('returns the source file ids for imported files', async () => {
    const { service } = makeService([
      { sourceFileId: 'file-1' },
      { sourceFileId: 'file-2' },
    ]);

    const result = await service.get('proj-1', 'org-1');

    expect(result).toEqual(['file-1', 'file-2']);
  });

  it('filters out null sourceFileId values', async () => {
    const { service } = makeService([
      { sourceFileId: 'file-1' },
      { sourceFileId: null },
    ]);

    const result = await service.get('proj-1', 'org-1');

    expect(result).toEqual(['file-1']);
  });

  it('queries scoped by projectId, organizationId, and non-null sourceFileId', async () => {
    const { service, findMany } = makeService([]);

    await service.get('proj-1', 'org-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        projectId: 'proj-1',
        organizationId: 'org-1',
        sourceFileId: { not: null },
      },
      select: { sourceFileId: true },
    });
  });
});
