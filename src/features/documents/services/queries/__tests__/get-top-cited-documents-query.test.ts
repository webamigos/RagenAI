import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGroupBy = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    documentCitation: { groupBy: mockGroupBy },
    userFile: { findMany: mockFindMany },
  },
}));

import { getTopCitedDocumentsQuery } from '../get-top-cited-documents-query';

const ORG_ID = 'org-abc';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTopCitedDocumentsQuery', () => {
  it('returns empty array when no citations', async () => {
    mockGroupBy.mockResolvedValue([]);
    const result = await getTopCitedDocumentsQuery(ORG_ID);
    expect(result).toEqual([]);
  });

  it('scopes citations by orgId', async () => {
    mockGroupBy.mockResolvedValue([]);
    await getTopCitedDocumentsQuery(ORG_ID);
    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: ORG_ID }),
      }),
    );
  });

  it('returns top 10 sorted by citation count desc', async () => {
    const groups = Array.from({ length: 12 }, (_, i) => ({
      fileId: `file-${i}`,
      _count: { fileId: 12 - i },
    }));
    mockGroupBy.mockResolvedValue(groups.slice(0, 10));
    mockFindMany.mockResolvedValue(
      groups.slice(0, 10).map((g) => ({
        id: g.fileId,
        fileName: `doc-${g.fileId}.pdf`,
      })),
    );

    const result = await getTopCitedDocumentsQuery(ORG_ID);

    expect(result).toHaveLength(10);
    expect(result[0].citationCount).toBeGreaterThanOrEqual(
      result[1].citationCount,
    );
  });
});
