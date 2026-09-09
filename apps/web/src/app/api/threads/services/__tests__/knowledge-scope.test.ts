import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock every external the module-under-test touches. What is under test here
// is which of them get called, so the mocks are the assertion surface.
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
vi.mock('@/app/lib/services/llm', () => ({
  createChatCompletionInstance: vi.fn(),
  createModerationInstance: vi.fn(),
  createEmbeddingsInstance: vi.fn(),
}));
vi.mock('@/libs/chains/basic-rag/chain', () => ({
  basicRagChain: vi.fn().mockResolvedValue({ stream: vi.fn() }),
}));
vi.mock('@/libs/vector-store/qdrant-client', () => ({
  // Constructed with `new`. Vitest 4 constructs the mock's own implementation,
  // and an arrow function is not a constructor.
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
  () => ({
    getImportedKbFileIdsQuery: vi.fn().mockResolvedValue([]),
  }),
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NO_ACCESS_PRINCIPAL } from '@ragenai/platform-contracts';
import { getImportedKbFileIdsQuery } from '@/features/documents/services/queries/get-imported-kb-file-ids-query';

import { initializeRagChain } from '../initializeBasicRag';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';

const baseArgs = {
  settings: {
    apiKey: 'k',
    model: 'gpt-5.4',
    temperature: 0.7,
    prompt: '',
    maxDocumentsToRetrieve: 5,
  } as Parameters<typeof initializeRagChain>[0]['settings'],
  orgId: 'org-1',
  userId: 'user-1',
};

const configOf = () =>
  vi.mocked(basicRagChain).mock.calls[0][0].config as NonNullable<
    Parameters<typeof basicRagChain>[0]['config']
  >;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initializeRagChain — the thread`s knowledge scope', () => {
  it('defaults to KNOWLEDGE_BASE, so a caller that predates the field is unchanged', async () => {
    await initializeRagChain({ ...baseArgs });

    expect(configOf().knowledgeScope).toBe('KNOWLEDGE_BASE');
    expect(configOf().metadataFilter).toBeDefined();
  });

  it('passes the scope down to the chain', async () => {
    await initializeRagChain({ ...baseArgs, knowledgeScope: 'MODEL_ONLY' });

    expect(configOf().knowledgeScope).toBe('MODEL_ONLY');
  });

  it('builds no metadata filter for MODEL_ONLY, and asks Postgres nothing', async () => {
    // Not just dead weight: the project branch of buildMetadataFilter reads
    // imported KB file ids out of the database. Nothing will search the vector
    // store this turn, so neither should run.
    await initializeRagChain({
      ...baseArgs,
      projectId: 'proj-1',
      knowledgeScope: 'MODEL_ONLY',
    });

    expect(configOf().metadataFilter).toBeUndefined();
    expect(getImportedKbFileIdsQuery).not.toHaveBeenCalled();
  });

  it('searches every reachable file when no project is named', async () => {
    // Level 1 is defined as the set on /knowledge/documents-list, which is
    // filtered by access and not by project. The filter used to add
    // `project_id is_null`, so a file inside an assistant showed on that page
    // and was invisible to a question about it.
    await initializeRagChain({ ...baseArgs });

    const filter = configOf().metadataFilter as {
      must: { key: string }[];
      should?: unknown;
    };
    expect(filter.must.map((c) => c.key)).toEqual([
      'metadata.organization_id',
      'metadata.accessible_by',
    ]);
    expect(filter.should).toBeUndefined();
  });

  it('still fails closed for a non-member, wider subject or not', async () => {
    // The widening is of subject, never of permission.
    await initializeRagChain({ ...baseArgs, scope: 'none' });

    const filter = configOf().metadataFilter as {
      must: { key: string; match_any?: { values: string[] } }[];
    };
    const principals = filter.must.find(
      (c) => c.key === 'metadata.accessible_by',
    );
    expect(principals?.match_any?.values).toEqual([NO_ACCESS_PRINCIPAL]);
  });

  it('does not widen a thread that names a project', async () => {
    // That thread is level 2 and takes the project branch.
    await initializeRagChain({ ...baseArgs, projectId: 'proj-1' });

    const filter = configOf().metadataFilter as { must: { key: string }[] };
    expect(filter.must.map((c) => c.key)).toContain('metadata.project_id');
  });

  it('still builds one for ASSISTANT', async () => {
    await initializeRagChain({
      ...baseArgs,
      projectId: 'proj-1',
      knowledgeScope: 'ASSISTANT',
    });

    expect(configOf().metadataFilter).toBeDefined();
  });

  it('rejects ASSISTANT with no project rather than widening the search', async () => {
    // The whole point of the row in the spec's wire table: a client bug must
    // not turn into a broader answer. Falling back to the knowledge base here
    // would be the same shape of failure as #1006 and #1007.
    await expect(
      initializeRagChain({ ...baseArgs, knowledgeScope: 'ASSISTANT' }),
    ).rejects.toThrow(/requires a resolvable projectId/);
  });

  it('rejects before doing any work, so the failure is cheap and obvious', async () => {
    await expect(
      initializeRagChain({ ...baseArgs, knowledgeScope: 'ASSISTANT' }),
    ).rejects.toThrow();

    expect(basicRagChain).not.toHaveBeenCalled();
  });

  it.each(['KNOWLEDGE_BASE', 'MODEL_ONLY'] as const)(
    'does not require a project for %s',
    async (knowledgeScope) => {
      await expect(
        initializeRagChain({ ...baseArgs, knowledgeScope }),
      ).resolves.toBeDefined();
    },
  );
});
