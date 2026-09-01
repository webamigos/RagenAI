import { GetOrganizationMetadataService } from './get-organization-metadata.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('GetOrganizationMetadataService', () => {
  function makeService(findUniqueResult: unknown) {
    const findUnique = jest.fn().mockResolvedValue(findUniqueResult);
    const prisma = {
      client: { organization: { findUnique } },
    } as unknown as PrismaService;
    return { service: new GetOrganizationMetadataService(prisma) };
  }

  it('returns metadata mapped from the organization row', async () => {
    const { service } = makeService({
      hasKnowledge: true,
      vectorStore: 'qdrant',
    });

    const result = await service.get('org-1');

    expect(result).toEqual({
      publicMetadata: { hasKnowledge: true },
      vectorStore: 'qdrant',
    });
  });

  it('maps a null vectorStore to undefined', async () => {
    const { service } = makeService({ hasKnowledge: false, vectorStore: null });

    const result = await service.get('org-1');

    expect(result.vectorStore).toBeUndefined();
  });

  it('returns empty metadata when the organization is not found', async () => {
    const { service } = makeService(null);

    const result = await service.get('org-missing');

    expect(result).toEqual({
      publicMetadata: undefined,
      vectorStore: undefined,
    });
  });
});
