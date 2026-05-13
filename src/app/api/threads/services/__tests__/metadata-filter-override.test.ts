import { describe, it, expect, vi } from 'vitest';

// Mock every external the module-under-test touches. We only care that the
// override path rejects filters that don't pin organization_id — the rest
// of initializeRagChain is exercised elsewhere.
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
  QdrantVectorStoreClient: vi.fn().mockImplementation(() => ({
    similaritySearch: vi.fn().mockResolvedValue([]),
    addDocuments: vi.fn().mockResolvedValue(undefined),
  })),
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
};

describe('initializeRagChain — metadataFilter override guardrail', () => {
  it('rejects an override that omits `must`', async () => {
    await expect(
      initializeRagChain({
        ...baseArgs,
        metadataFilter: { should: [] },
      }),
    ).rejects.toThrow(/metadataFilter override must include a `must` array/);
  });

  it('rejects an override missing organization_id', async () => {
    await expect(
      initializeRagChain({
        ...baseArgs,
        metadataFilter: {
          must: [{ key: 'metadata.file_id', match: { value: 'f-1' } }],
        },
      }),
    ).rejects.toThrow(/missing required metadata.organization_id=org-1/);
  });

  it('rejects an override with a different org_id (cross-org attempt)', async () => {
    await expect(
      initializeRagChain({
        ...baseArgs,
        metadataFilter: {
          must: [
            {
              key: 'metadata.organization_id',
              match: { value: 'different-org' },
            },
          ],
        },
      }),
    ).rejects.toThrow(/missing required metadata.organization_id=org-1/);
  });

  it('accepts an override that pins organization_id correctly', async () => {
    const override = {
      must: [
        { key: 'metadata.organization_id', match: { value: 'org-1' } },
        {
          key: 'metadata.accessible_by',
          match_any: { values: ['org:org-1'] },
        },
      ],
    };

    await initializeRagChain({
      ...baseArgs,
      metadataFilter: override,
    });

    expect(basicRagChain).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ metadataFilter: override }),
      }),
    );
  });
});
