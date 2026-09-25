import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  knowledgePage: { groupBy: vi.fn() },
  knowledgeFinding: { groupBy: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const { getBrainStatusCountsQuery } =
  await import('../services/queries/get-brain-status-counts-query');

beforeEach(() => vi.clearAllMocks());

describe('getBrainStatusCountsQuery', () => {
  it('counts per status inside the organization, zero for a status with no rows', async () => {
    db.knowledgePage.groupBy.mockResolvedValue([
      { status: 'CANDIDATE', _count: { _all: 123 } },
      { status: 'APPROVED', _count: { _all: 4 } },
    ]);
    db.knowledgeFinding.groupBy.mockResolvedValue([
      { status: 'OPEN', _count: { _all: 7 } },
    ]);
    expect(await getBrainStatusCountsQuery('org-1')).toEqual({
      pages: { CANDIDATE: 123, APPROVED: 4, STALE: 0, REJECTED: 0 },
      findings: { OPEN: 7, RESOLVED: 0, DISMISSED: 0 },
    });
    for (const call of [
      db.knowledgePage.groupBy.mock.calls[0]![0],
      db.knowledgeFinding.groupBy.mock.calls[0]![0],
    ]) {
      expect(call.where).toEqual({ organizationId: 'org-1' });
      expect(call.by).toEqual(['status']);
    }
  });
});
