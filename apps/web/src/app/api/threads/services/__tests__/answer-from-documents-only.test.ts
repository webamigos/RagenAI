import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Both web chain factories hand the chain the assistant's grounding setting,
 * read by the project id they were given — never one from the request — and
 * scoped by organization (spec 2026-10-03-retrieval-claims-match-the-product-
 * before-launch, Phase C2). The panel and the API routes go through
 * `initializeRagChain`; the public assistant page through
 * `initializePublicRagChain`.
 */

const mockGetAnswerFromDocumentsOnly = vi.hoisted(() => vi.fn());

vi.mock(
  '@/features/projects/services/queries/get-answer-from-documents-only-query',
  () => ({
    getAnswerFromDocumentsOnlyQuery: (...args: unknown[]) =>
      mockGetAnswerFromDocumentsOnly(...args),
  }),
);
vi.mock(
  '@/features/organizations/services/queries/get-organization-metadata-query',
  () => ({
    getOrganizationMetadataQuery: vi
      .fn()
      .mockResolvedValue({ vectorStore: 'qdrant' }),
  }),
);
vi.mock('@/features/organizations/services/organization-settings', () => ({
  getRagPipelineSettings: vi.fn().mockResolvedValue({
    multiQueryEnabled: false,
    contentModerationEnabled: false,
    rerankingEnabled: false,
  }),
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: vi.fn().mockResolvedValue(false) }),
);
vi.mock('@/app/lib/services/llm', () => ({
  createChatCompletionInstance: vi.fn(),
  createModerationInstance: vi.fn(),
  createEmbeddingsInstance: vi.fn(),
}));
vi.mock('@/libs/chains/basic-rag/chain', () => ({
  basicRagChain: vi.fn().mockResolvedValue({ stream: vi.fn() }),
}));
vi.mock('@/libs/vector-store/qdrant-client', () => ({
  QdrantVectorStoreClient: vi.fn(function () {
    return {
      similaritySearch: vi.fn().mockResolvedValue([]),
      addDocuments: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));
vi.mock('@/libs/vector-store/meilisearch-client', () => ({
  MeilisearchVectorStoreClient: vi.fn(),
}));
vi.mock('@/libs/vector-store/supabase-client', () => ({
  SupabaseVectorStoreClient: vi.fn(),
}));
vi.mock('@/libs/db/supabaseVectorStoreClient', () => ({
  supabaseVectorStoreClient: {},
}));
vi.mock(
  '@/features/documents/services/queries/get-imported-kb-file-ids-query',
  () => ({ getImportedKbFileIdsQuery: vi.fn().mockResolvedValue([]) }),
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { initializeRagChain } from '../initializeBasicRag';
import { initializePublicRagChain } from '../../../guest-threads/[...guestDetails]/services/initializePublicBasicRag';

const settings = {
  apiKey: 'k',
  model: 'gpt-5.4',
  temperature: 0.7,
  prompt: '',
  maxDocumentsToRetrieve: 5,
} as Parameters<typeof initializeRagChain>[0]['settings'];

const configOf = () =>
  vi.mocked(basicRagChain).mock.calls[0][0].config as NonNullable<
    Parameters<typeof basicRagChain>[0]['config']
  >;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initializeRagChain — answer from documents only', () => {
  it.each([true, false])(
    'passes the resolved setting (%s) for an assistant turn',
    async (resolved) => {
      mockGetAnswerFromDocumentsOnly.mockResolvedValue(resolved);

      await initializeRagChain({
        settings,
        orgId: 'org-1',
        userId: 'user-1',
        projectId: 'proj-1',
        knowledgeScope: 'ASSISTANT',
      });

      expect(mockGetAnswerFromDocumentsOnly).toHaveBeenCalledWith(
        'proj-1',
        'org-1',
      );
      expect(configOf().answerFromDocumentsOnly).toBe(resolved);
    },
  );

  it('uses a forced rule as given, reading no setting — the embedded widget', async () => {
    await initializeRagChain({
      settings,
      orgId: 'org-1',
      scope: 'none',
      answerFromDocumentsOnly: true,
    });

    expect(mockGetAnswerFromDocumentsOnly).not.toHaveBeenCalled();
    expect(configOf().answerFromDocumentsOnly).toBe(true);
  });

  it("keeps today's rule with no assistant, and reads nothing", async () => {
    await initializeRagChain({ settings, orgId: 'org-1', userId: 'user-1' });

    expect(mockGetAnswerFromDocumentsOnly).not.toHaveBeenCalled();
    expect(configOf().answerFromDocumentsOnly).toBe(false);
  });

  it("keeps today's rule on a MODEL_ONLY turn, which has no context to stay inside", async () => {
    mockGetAnswerFromDocumentsOnly.mockResolvedValue(true);

    await initializeRagChain({
      settings,
      orgId: 'org-1',
      userId: 'user-1',
      projectId: 'proj-1',
      knowledgeScope: 'MODEL_ONLY',
    });

    expect(mockGetAnswerFromDocumentsOnly).not.toHaveBeenCalled();
    expect(configOf().answerFromDocumentsOnly).toBe(false);
  });
});

describe('initializePublicRagChain — answer from documents only', () => {
  it.each([true, false])(
    'passes the resolved setting (%s) for the public project',
    async (resolved) => {
      mockGetAnswerFromDocumentsOnly.mockResolvedValue(resolved);

      await initializePublicRagChain({
        settings,
        organizationId: 'org-1',
        projectId: 'proj-1',
      });

      expect(mockGetAnswerFromDocumentsOnly).toHaveBeenCalledWith(
        'proj-1',
        'org-1',
      );
      expect(configOf().answerFromDocumentsOnly).toBe(resolved);
    },
  );
});
