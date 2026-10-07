import { beforeEach, describe, expect, it, vi } from 'vitest';

const fileFindMany = vi.fn();
const groupBy = vi.fn();
const pairFindMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: { findMany: (...a: unknown[]) => fileFindMany(...a) },
    knowledgePageSource: {
      groupBy: (...a: unknown[]) => groupBy(...a),
      findMany: vi.fn().mockResolvedValue([]),
    },
    documentPair: { findMany: (...a: unknown[]) => pairFindMany(...a) },
  },
}));
const isFeatureEnabled = vi.fn();
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...a: unknown[]) => isFeatureEnabled(...a),
  }),
);

import { getBrainDocumentsQuery } from '../services/queries/get-brain-documents-query';

const file = (id: string, language: string) => ({
  id,
  fileName: `${id}.pdf`,
  embeddingStatus: 'COMPLETED',
  createdAt: null,
  language,
});

/** groupBy is called for APPROVED then CANDIDATE. */
function sources(approved: [string, number][], candidates: [string, number][]) {
  const rows = (pairs: [string, number][]) =>
    pairs.map(([fileId, pageId]) => ({ fileId, pageId }));
  groupBy
    .mockResolvedValueOnce(rows(approved))
    .mockResolvedValueOnce(rows(candidates));
}

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabled.mockResolvedValue(true);
  pairFindMany.mockResolvedValue([]);
});

describe('Brain documents with language pairs', () => {
  it('reads no pairs while the feature is off', async () => {
    isFeatureEnabled.mockResolvedValue(false);
    fileFindMany.mockResolvedValueOnce([file('a', 'pol')]);
    sources([['a', 1]], []);
    const [doc] = await getBrainDocumentsQuery('org');
    expect(pairFindMany).not.toHaveBeenCalled();
    expect(doc!.pair).toBeUndefined();
  });

  it('counts a page that cites both files once, and keeps each file own counts', async () => {
    fileFindMany
      .mockResolvedValueOnce([file('a', 'pol'), file('b', 'eng')])
      .mockResolvedValueOnce([
        { id: 'b', fileName: 'b.pdf', language: 'eng' },
        { id: 'a', fileName: 'a.pdf', language: 'pol' },
      ]);
    pairFindMany.mockResolvedValue([{ fileAId: 'a', fileBId: 'b' }]);
    sources(
      [
        ['a', 1],
        ['a', 2],
        ['b', 2],
        ['b', 3],
      ],
      [['b', 9]],
    );
    const docs = await getBrainDocumentsQuery('org');
    const a = docs.find((d) => d.fileId === 'a')!;
    const b = docs.find((d) => d.fileId === 'b')!;
    expect(a.approvedPages).toBe(2);
    expect(b.approvedPages).toBe(2);
    expect(a.pair).toMatchObject({
      fileId: 'b',
      fileName: 'b.pdf',
      language: 'eng',
      approvedPages: 3,
      candidatePages: 1,
    });
    expect(b.pair).toMatchObject({ fileId: 'a', approvedPages: 3 });
  });

  it('shows the counterpart a language filter hides, and counts its pages', async () => {
    fileFindMany
      .mockResolvedValueOnce([file('a', 'pol')])
      .mockResolvedValueOnce([{ id: 'b', fileName: 'b.pdf', language: 'eng' }]);
    pairFindMany.mockResolvedValue([{ fileAId: 'a', fileBId: 'b' }]);
    sources([['b', 5]], []);
    const [doc] = await getBrainDocumentsQuery('org');
    expect(doc!.pair).toMatchObject({ fileId: 'b', approvedPages: 1 });
    const where = groupBy.mock.calls[0][0].where;
    expect(where.fileId.in).toEqual(['a', 'b']);
    expect(where.organizationId).toBe('org');
  });

  it('looks pairs up by organization and never lists a Brain vehicle as a counterpart', async () => {
    fileFindMany
      .mockResolvedValueOnce([file('a', 'pol')])
      .mockResolvedValueOnce([]);
    pairFindMany.mockResolvedValue([{ fileAId: 'a', fileBId: 'b' }]);
    sources([], []);
    const [doc] = await getBrainDocumentsQuery('org');
    expect(pairFindMany.mock.calls[0][0].where.organizationId).toBe('org');
    expect(fileFindMany.mock.calls[1][0].where).toMatchObject({
      organizationId: 'org',
      publishedPages: { none: {} },
    });
    expect(doc!.pair).toBeUndefined();
  });
});
