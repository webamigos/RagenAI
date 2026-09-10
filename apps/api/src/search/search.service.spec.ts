/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { NotFoundException } from '@nestjs/common';
import { SearchService } from './search.service.js';
import { retrieveRelevantDocumentsWithIds } from '../chains/basic-rag/operations.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../common/types/brand.js';
import { type SearchDto } from './dto/search.dto.js';

jest.mock('../chains/basic-rag/operations.js', () => ({
  retrieveRelevantDocumentsWithIds: jest.fn(),
}));

const mockRetrieve = retrieveRelevantDocumentsWithIds as jest.MockedFunction<
  typeof retrieveRelevantDocumentsWithIds
>;

describe('SearchService', () => {
  let service: SearchService;

  let prisma: { client: { project: { findFirst: jest.Mock } } };
  let apiLimits: { checkApiRequestLimit: jest.Mock };
  let organizationSettings: {
    getAllSettings: jest.Mock;
    getRagPipelineSettings: jest.Mock;
  };
  let resolveLiteLLMKey: { resolveForRequest: jest.Mock };
  let initializeBasicRag: { buildRetrievalContext: jest.Mock };
  let aiUsage: { track: jest.Mock };

  const mockContext: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-1' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  const baseDto: SearchDto = {
    assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    query: 'What is our refund policy?',
  };

  const fakeVectorStore = { similaritySearch: jest.fn() };

  beforeEach(() => {
    prisma = { client: { project: { findFirst: jest.fn() } } };
    apiLimits = { checkApiRequestLimit: jest.fn() };
    organizationSettings = {
      getAllSettings: jest.fn(),
      getRagPipelineSettings: jest.fn(),
    };
    resolveLiteLLMKey = { resolveForRequest: jest.fn() };
    initializeBasicRag = { buildRetrievalContext: jest.fn() };
    aiUsage = { track: jest.fn().mockResolvedValue(undefined) };

    prisma.client.project.findFirst.mockResolvedValue({ id: 'proj-1' });
    apiLimits.checkApiRequestLimit.mockResolvedValue({
      exceeded: false,
      current: 0,
      limit: null,
    });
    organizationSettings.getAllSettings.mockResolvedValue({
      apiKey: 'sk-pool',
      maxDocumentsToRetrieve: 4,
    });
    organizationSettings.getRagPipelineSettings.mockResolvedValue({
      multiQueryEnabled: true,
      contentModerationEnabled: false,
      rerankingEnabled: true,
    });
    resolveLiteLLMKey.resolveForRequest.mockResolvedValue({
      apiKey: 'sk-litellm',
      teamId: null,
      source: 'org',
    });
    initializeBasicRag.buildRetrievalContext.mockResolvedValue({
      vectorStore: fakeVectorStore,
      metadataFilter: { must: [] },
    });
    mockRetrieve.mockReset();
    mockRetrieve.mockResolvedValue({
      context: '<chunk file="policy.md">Refunds within 30 days.</chunk>',
      fileIds: ['file-1'],
    });

    service = new SearchService(
      prisma as any,
      apiLimits as any,
      organizationSettings as any,
      resolveLiteLLMKey as any,
      initializeBasicRag as any,
      aiUsage as any,
    );
  });

  it('scopes the project lookup to the caller org (IDOR guard)', async () => {
    await service.search(baseDto, mockContext);

    expect(prisma.client.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        organizationId: 'org-1',
      },
      select: { id: true },
    });
  });

  it('strips the asst- prefix from assistant_id when resolving the project', async () => {
    await service.search(
      { ...baseDto, assistant_id: 'asst-a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
      mockContext,
    );

    expect(prisma.client.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        }),
      }),
    );
  });

  it('throws NotFoundException when the assistant/project is not found', async () => {
    prisma.client.project.findFirst.mockResolvedValue(null);

    await expect(service.search(baseDto, mockContext)).rejects.toThrow(
      NotFoundException,
    );
    expect(initializeBasicRag.buildRetrievalContext).not.toHaveBeenCalled();
  });

  it('throws a 429 when the monthly API request limit is exceeded', async () => {
    apiLimits.checkApiRequestLimit.mockResolvedValue({
      exceeded: true,
      current: 100,
      limit: 100,
    });

    await expect(service.search(baseDto, mockContext)).rejects.toMatchObject({
      status: 429,
    });
    expect(initializeBasicRag.buildRetrievalContext).not.toHaveBeenCalled();
  });

  it('retrieves chunks and returns { context, file_ids }', async () => {
    const result = await service.search(baseDto, mockContext);

    expect(result).toEqual({
      context: '<chunk file="policy.md">Refunds within 30 days.</chunk>',
      file_ids: ['file-1'],
    });
    expect(mockRetrieve).toHaveBeenCalledWith(
      fakeVectorStore,
      'What is our refund policy?',
      4,
      { must: [] },
      'sk-litellm',
      true,
      {
        organizationId: 'org-1',
        projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        userId: 'user-1',
      },
      expect.any(Function),
    );
  });

  it('uses max_results over the org default when provided', async () => {
    await service.search({ ...baseDto, max_results: 2 }, mockContext);

    expect(mockRetrieve).toHaveBeenCalledWith(
      fakeVectorStore,
      'What is our refund policy?',
      2,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('respects the reranking setting from the org RAG pipeline settings', async () => {
    organizationSettings.getRagPipelineSettings.mockResolvedValue({
      multiQueryEnabled: true,
      contentModerationEnabled: false,
      rerankingEnabled: false,
    });

    await service.search(baseDto, mockContext);

    expect(mockRetrieve).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      false,
      expect.anything(),
      expect.anything(),
    );
  });

  it('wraps a retrieval failure as a 500', async () => {
    mockRetrieve.mockRejectedValue(new Error('vector store unreachable'));

    await expect(service.search(baseDto, mockContext)).rejects.toMatchObject({
      status: 500,
    });
  });
});
