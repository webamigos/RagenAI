import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: { findMany: mockFindMany },
  },
}));

import { getKnowledgeAnalyticsSummaryQuery } from '../get-knowledge-analytics-summary-query';

const ORG_ID = 'org-abc';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getKnowledgeAnalyticsSummaryQuery', () => {
  it('returns zero summary when no threads', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getKnowledgeAnalyticsSummaryQuery(ORG_ID, 30);

    expect(result.totalQuestions).toBe(0);
    expect(result.uniqueUsers).toBe(0);
    expect(result.positiveRatePct).toBe(0);
  });

  it('scopes query by orgId', async () => {
    mockFindMany.mockResolvedValue([]);

    await getKnowledgeAnalyticsSummaryQuery(ORG_ID, 30);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID }),
      }),
    );
  });

  it('calculates positiveRatePct correctly', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 't1',
        userId: 'u1',
        messages: [
          { id: 'm1', rate: 1 },
          { id: 'm2', rate: 0 },
          { id: 'm3', rate: null },
          { id: 'm4', rate: 1 },
        ],
      },
    ]);

    const result = await getKnowledgeAnalyticsSummaryQuery(ORG_ID, 30);

    // rate=1: 2, rate=0: 1, rate=null: 1 → rated total: 3, positive: 2 → ~66.67%
    expect(result.positiveRatePct).toBeCloseTo(66.67, 0);
  });
});
