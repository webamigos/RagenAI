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

/**
 * The built filter, when no override is supplied.
 *
 * These cover the two ways the access condition could be omitted rather than
 * denied — which is the dangerous shape, because omitting it leaves only the
 * organization condition, and that is the *widest* answer reached by accident.
 */
describe('initializeRagChain — the built metadata filter', () => {
  const filterFor = async (
    args: Partial<Parameters<typeof initializeRagChain>[0]>,
  ) => {
    vi.mocked(basicRagChain).mockClear();
    await initializeRagChain({ ...baseArgs, ...args });
    const call = vi.mocked(basicRagChain).mock.calls[0]![0] as {
      config: { metadataFilter: { must: Record<string, unknown>[] } };
    };
    return call.config.metadataFilter;
  };

  const accessCondition = (filter: { must: Record<string, unknown>[] }) =>
    filter.must.find((c) => c.key === 'metadata.accessible_by') as
      { match_any: { values: string[] } } | undefined;

  it("denies everything for the 'none' scope", async () => {
    const filter = await filterFor({ scope: 'none', userId: 'user-1' });
    expect(accessCondition(filter)?.match_any.values).toEqual([
      NO_ACCESS_PRINCIPAL,
    ]);
  });

  it("denies everything for the 'member' scope with no user id", async () => {
    // The regression this closes: the condition used to be skipped entirely
    // here, leaving `must` at the organization filter alone — org-wide
    // retrieval for an actor with no identity.
    const filter = await filterFor({ scope: 'member', userId: null });
    expect(accessCondition(filter)?.match_any.values).toEqual([
      NO_ACCESS_PRINCIPAL,
    ]);
  });

  it("grants the caller's own principals for a member with a user id", async () => {
    const filter = await filterFor({
      scope: 'member',
      userId: 'user-1',
      userTeamIds: ['team-1', 'team-2'],
    });
    expect(accessCondition(filter)?.match_any.values).toEqual([
      'org:org-1',
      'user:user-1',
      'team:team-1',
      'team:team-2',
    ]);
  });

  it("applies no access condition at all for the 'organization' scope", async () => {
    const filter = await filterFor({ scope: 'organization', userId: 'user-1' });
    expect(accessCondition(filter)).toBeUndefined();
  });

  it('always pins the organization, whatever the scope', async () => {
    for (const scope of ['organization', 'member', 'none'] as const) {
      const filter = await filterFor({ scope, userId: 'user-1' });
      expect(filter.must).toContainEqual({
        key: 'metadata.organization_id',
        match: { value: 'org-1' },
      });
    }
  });
});
