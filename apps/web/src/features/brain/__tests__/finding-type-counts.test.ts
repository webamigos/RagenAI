import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ knowledgeFinding: { groupBy: vi.fn() } }));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));
import { getFindingTypeCountsQuery } from '../services/queries/get-finding-type-counts-query';
beforeEach(() => vi.resetAllMocks());
it('counts every type including zero with the same organization, status and language scope as the list', async () => {
  db.knowledgeFinding.groupBy.mockResolvedValue([
    { type: 'ORPHAN', _count: { _all: 2 } },
  ]);
  const counts = await getFindingTypeCountsQuery('org', 'OPEN');
  expect(counts).toEqual({
    ORPHAN: 2,
    CONTRADICTION: 0,
    GAP: 0,
    STALE: 0,
    UNOWNED: 0,
    EXTRACTION_FAILED: 0,
  });
  expect(db.knowledgeFinding.groupBy).toHaveBeenCalledWith({
    by: ['type'],
    where: { organizationId: 'org', status: 'OPEN' },
    _count: { _all: true },
  });
});
