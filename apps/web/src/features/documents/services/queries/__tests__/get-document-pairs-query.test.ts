import { beforeEach, describe, expect, it, vi } from 'vitest';

const pairFindMany = vi.fn();
const fileFindMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentPair: { findMany: (...a: unknown[]) => pairFindMany(...a) },
    userFile: { findMany: (...a: unknown[]) => fileFindMany(...a) },
  },
}));
const isFeatureEnabled = vi.fn();
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...a: unknown[]) => isFeatureEnabled(...a),
  }),
);

import { getDocumentPairsQuery } from '../get-document-pairs-query';

const actor = { userId: 'u1', teamIds: [], scope: 'member' } as never;
const counterpart = (id: string) => ({
  id,
  fileName: `${id}.pdf`,
  language: 'eng',
  piiPolicy: 'STRICT',
});

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabled.mockResolvedValue(true);
});

describe('getDocumentPairsQuery', () => {
  it('returns each asked file with its counterpart from either side', async () => {
    pairFindMany.mockResolvedValue([
      { fileAId: 'a', fileBId: 'b' },
      { fileAId: 'c', fileBId: 'd' },
    ]);
    fileFindMany.mockResolvedValue([counterpart('b'), counterpart('c')]);
    const entries = await getDocumentPairsQuery({
      organizationId: 'org',
      actor,
      fileIds: ['a', 'd'],
    });
    expect(entries).toEqual([
      { fileId: 'a', counterpart: counterpart('b') },
      { fileId: 'd', counterpart: counterpart('c') },
    ]);
  });

  it('hides a counterpart the actor cannot read, name and all', async () => {
    pairFindMany.mockResolvedValue([{ fileAId: 'a', fileBId: 'b' }]);
    fileFindMany.mockResolvedValue([]);
    await expect(
      getDocumentPairsQuery({ organizationId: 'org', actor, fileIds: ['a'] }),
    ).resolves.toEqual([]);
    const where = fileFindMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org');
    expect(where.publishedPages).toEqual({ none: {} });
  });

  it('scopes the pair lookup by organization', async () => {
    pairFindMany.mockResolvedValue([]);
    await getDocumentPairsQuery({
      organizationId: 'org',
      actor,
      fileIds: ['a'],
    });
    expect(pairFindMany.mock.calls[0][0].where.organizationId).toBe('org');
  });

  it('reads nothing when the feature is off or there is no user', async () => {
    isFeatureEnabled.mockResolvedValue(false);
    await expect(
      getDocumentPairsQuery({ organizationId: 'org', actor, fileIds: ['a'] }),
    ).resolves.toEqual([]);
    isFeatureEnabled.mockResolvedValue(true);
    await expect(
      getDocumentPairsQuery({
        organizationId: 'org',
        actor: { userId: null, teamIds: [], scope: 'none' } as never,
        fileIds: ['a'],
      }),
    ).resolves.toEqual([]);
    expect(pairFindMany).not.toHaveBeenCalled();
  });
});
