import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    userFile: { findMany: mockFindMany },
  },
}));

import { getUnusedDocumentsQuery } from '../get-unused-documents-query';

const ORG_ID = 'org-abc';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getUnusedDocumentsQuery', () => {
  it('returns empty array when no unused files', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await getUnusedDocumentsQuery(ORG_ID);
    expect(result).toEqual([]);
  });

  it('scopes query by orgId', async () => {
    mockFindMany.mockResolvedValue([]);
    await getUnusedDocumentsQuery(ORG_ID);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID }),
      }),
    );
  });

  it('filters for files with no citations in last 90 days', async () => {
    mockFindMany.mockResolvedValue([]);
    await getUnusedDocumentsQuery(ORG_ID);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentCitations: { none: expect.objectContaining({}) },
        }),
      }),
    );
  });

  it('calculates daysSinceUsed for file with no citations', async () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValue([
      {
        id: 'file-1',
        fileName: 'old.pdf',
        documentCitations: [],
        createdAt: oldDate,
      },
    ]);

    const result = await getUnusedDocumentsQuery(ORG_ID);

    expect(result[0].lastCitedAt).toBeNull();
    expect(result[0].daysSinceUsed).toBeGreaterThanOrEqual(100);
  });
});
