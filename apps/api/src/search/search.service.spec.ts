/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import type { Mock, MockedFunction } from 'vitest';
import { AssistantScopeService } from '../common/services/assistant-scope.service.js';
import { ForbiddenException } from '@nestjs/common';
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

vi.mock('../chains/basic-rag/operations.js', () => ({
  retrieveRelevantDocumentsWithIds: vi.fn(),
}));

const mockRetrieve = retrieveRelevantDocumentsWithIds as MockedFunction<
  typeof retrieveRelevantDocumentsWithIds
>;

describe('SearchService', () => {
  let service: SearchService;

  let prisma: { client: { project: { findFirst: Mock } } };
  let apiLimits: {
    checkApiRequestLimit: Mock;
    checkUsageCeilings: Mock;
  };
  let organizationSettings: {
    getAllSettings: Mock;
    getRagPipelineSettings: Mock;
  };
  let initializeBasicRag: { buildRetrievalContext: Mock };
  let aiUsage: { track: Mock };
  let folders: { getMembershipContext: Mock };

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

  const fakeVectorStore = { similaritySearch: vi.fn() };

  beforeEach(() => {
    prisma = { client: { project: { findFirst: vi.fn() } } };
    apiLimits = {
      checkApiRequestLimit: vi.fn(),
      checkUsageCeilings: vi.fn(),
    };
    // Under every ceiling unless a test says otherwise.
    apiLimits.checkUsageCeilings.mockResolvedValue({
      exceeded: [],
      current: { totalTokens: 0, totalCostCents: 0, totalMessages: 0 },
      limits: {
        monthlyTokenLimit: null,
        monthlyCostLimitCents: null,
        monthlyMessageLimit: null,
      },
    });
    organizationSettings = {
      getAllSettings: vi.fn(),
      getRagPipelineSettings: vi.fn(),
    };
    initializeBasicRag = { buildRetrievalContext: vi.fn() };
    aiUsage = { track: vi.fn().mockResolvedValue(undefined) };
    folders = { getMembershipContext: vi.fn() };

    prisma.client.project.findFirst.mockResolvedValue({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
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
    initializeBasicRag.buildRetrievalContext.mockResolvedValue({
      vectorStore: fakeVectorStore,
      metadataFilter: { must: [] },
    });
    folders.getMembershipContext.mockResolvedValue({
      scope: 'member',
      userTeamIds: ['team-1'],
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
      initializeBasicRag as any,
      aiUsage as any,
      folders as any,
      new AssistantScopeService(prisma as any),
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

  it('refuses an assistant the caller cannot reach', async () => {
    prisma.client.project.findFirst.mockResolvedValue(null);

    // 403, not 404: under a key scope the question is whether this caller
    // may ask, and a 404 would answer whether the assistant exists.
    await expect(service.search(baseDto, mockContext)).rejects.toThrow(
      ForbiddenException,
    );
    expect(initializeBasicRag.buildRetrievalContext).not.toHaveBeenCalled();
  });

  it('throws a 429 naming the ceilings when a usage ceiling is exceeded', async () => {
    apiLimits.checkUsageCeilings.mockResolvedValue({
      exceeded: ['tokens', 'cost'],
      current: { totalTokens: 2000, totalCostCents: 600, totalMessages: 2 },
      limits: {
        monthlyTokenLimit: 1000,
        monthlyCostLimitCents: 500,
        monthlyMessageLimit: null,
      },
    });

    await expect(service.search(baseDto, mockContext)).rejects.toMatchObject({
      status: 429,
      response: {
        error: 'Monthly usage limit exceeded',
        exceeded: ['tokens', 'cost'],
      },
    });
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
      true,
      {
        organizationId: 'org-1',
        projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        userId: 'user-1',
      },
      expect.any(Function),
    );
  });

  it('resolves the caller membership and passes scope/userTeamIds to buildRetrievalContext', async () => {
    folders.getMembershipContext.mockResolvedValue({
      scope: 'organization',
      userTeamIds: ['team-1', 'team-2'],
    });

    await service.search(baseDto, mockContext);

    expect(folders.getMembershipContext).toHaveBeenCalledWith(
      'org-1',
      'user-1',
    );
    expect(initializeBasicRag.buildRetrievalContext).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'organization',
        userTeamIds: ['team-1', 'team-2'],
      }),
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
