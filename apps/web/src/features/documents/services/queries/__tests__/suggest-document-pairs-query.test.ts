import { beforeEach, describe, expect, it, vi } from 'vitest';

const fileFindFirst = vi.fn();
const fileFindMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: {
      findFirst: (...a: unknown[]) => fileFindFirst(...a),
      findMany: (...a: unknown[]) => fileFindMany(...a),
    },
  },
}));

const similaritySearch = vi.fn();
vi.mock('@/libs/vector-store', () => ({
  QdrantVectorStoreClient: class {
    similaritySearch = (...a: unknown[]) => similaritySearch(...a);
  },
}));
vi.mock('@/app/lib/services/llm', () => ({
  createEmbeddingsInstance: vi.fn(() => ({})),
}));

const isFeatureEnabled = vi.fn();
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...a: unknown[]) => isFeatureEnabled(...a),
  }),
);

import { suggestDocumentPairsQuery } from '../suggest-document-pairs-query';

const actor = { userId: 'u1', teamIds: ['t1'], scope: 'member' } as never;
const input = {
  organizationId: 'org',
  actor,
  canManageOrg: false,
  fileId: 'pl-file',
};
const hit = (file_id: string, language?: string) => ({
  pageContent: 'summary',
  metadata: { file_id, ...(language ? { language } : {}) },
});
const row = (id: string, language: string | null = 'eng') => ({
  id,
  fileName: `${id}.pdf`,
  language,
  piiPolicy: 'STRICT',
});

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabled.mockResolvedValue(true);
  fileFindFirst.mockResolvedValue({
    id: 'pl-file',
    language: 'pol',
    metadata: { summary: 'Polityka urlopowa' },
  });
  similaritySearch.mockResolvedValue([]);
  fileFindMany.mockResolvedValue([]);
});

describe('suggestDocumentPairsQuery', () => {
  it('suggests in search order, one entry per file, from another language', async () => {
    similaritySearch.mockResolvedValue([
      hit('en-1', 'eng'),
      hit('en-1', 'eng'),
      hit('pl-file', 'pol'),
      hit('pl-2', 'pol'),
      hit('de-1', 'deu'),
    ]);
    fileFindMany.mockResolvedValue([row('de-1', 'deu'), row('en-1')]);
    const out = await suggestDocumentPairsQuery(input);
    expect(out.map((s) => s.id)).toEqual(['en-1', 'de-1']);
  });

  it('searches only summary chunks of the organization, within the access principals', async () => {
    await suggestDocumentPairsQuery(input);
    const [query, , filter] = similaritySearch.mock.calls[0];
    expect(query).toBe('Polityka urlopowa');
    expect(filter.must).toContainEqual({
      key: 'metadata.organization_id',
      match: { value: 'org' },
    });
    expect(filter.must).toContainEqual({
      key: 'metadata.chunk_type',
      match: { value: 'summary' },
    });
    expect(
      filter.must.find(
        (c: { key: string }) => c.key === 'metadata.accessible_by',
      ).match_any.values,
    ).toEqual(['org:org', 'user:u1', 'team:t1']);
  });

  it('does not filter by principals for the organization scope', async () => {
    await suggestDocumentPairsQuery({
      ...input,
      actor: { userId: 'u1', teamIds: [], scope: 'organization' } as never,
    });
    const filter = similaritySearch.mock.calls[0][2];
    expect(
      filter.must.some(
        (c: { key: string }) => c.key === 'metadata.accessible_by',
      ),
    ).toBe(false);
  });

  it('reads every candidate back with organization, access, manage right and no pair', async () => {
    similaritySearch.mockResolvedValue([hit('en-1', 'eng')]);
    await suggestDocumentPairsQuery(input);
    const where = fileFindMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org');
    expect(where.ownerId).toBe('u1');
    expect(where.publishedPages).toEqual({ none: {} });
    expect(where.pairMembership).toEqual({ is: null });
  });

  it('drops a candidate the database does not confirm', async () => {
    similaritySearch.mockResolvedValue([
      hit('en-1', 'eng'),
      hit('en-2', 'eng'),
    ]);
    fileFindMany.mockResolvedValue([row('en-2')]);
    const out = await suggestDocumentPairsQuery(input);
    expect(out.map((s) => s.id)).toEqual(['en-2']);
  });

  it('suggests nothing for a file that is already paired, unreadable, or without a summary', async () => {
    fileFindFirst.mockResolvedValue(null);
    await expect(suggestDocumentPairsQuery(input)).resolves.toEqual([]);
    fileFindFirst.mockResolvedValue({
      id: 'pl-file',
      language: 'pol',
      metadata: {},
    });
    await expect(suggestDocumentPairsQuery(input)).resolves.toEqual([]);
    expect(similaritySearch).not.toHaveBeenCalled();
  });

  it('suggests nothing when the feature is off or there is no user', async () => {
    isFeatureEnabled.mockResolvedValue(false);
    await expect(suggestDocumentPairsQuery(input)).resolves.toEqual([]);
    isFeatureEnabled.mockResolvedValue(true);
    await expect(
      suggestDocumentPairsQuery({
        ...input,
        actor: { userId: null, teamIds: [], scope: 'none' } as never,
      }),
    ).resolves.toEqual([]);
    expect(fileFindFirst).not.toHaveBeenCalled();
  });

  it('caps the list at five', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    similaritySearch.mockResolvedValue(ids.map((id) => hit(id, 'eng')));
    fileFindMany.mockResolvedValue(ids.map((id) => row(id)));
    const out = await suggestDocumentPairsQuery(input);
    expect(out).toHaveLength(5);
  });
});
