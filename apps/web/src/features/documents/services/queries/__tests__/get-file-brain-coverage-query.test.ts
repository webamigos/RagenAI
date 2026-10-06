import { beforeEach, describe, expect, it, vi } from 'vitest';
const groupBy = vi.hoisted(() => vi.fn());
vi.mock('@ragenai/prisma-client', () => ({
  default: { knowledgePageSource: { groupBy } },
}));
import { getFileBrainCoverageQuery } from '../get-file-brain-coverage-query';
beforeEach(() => vi.clearAllMocks());
describe('authorized file Brain coverage', () => {
  it('counts distinct live file/page pairs in scoped status batches', async () => {
    groupBy
      .mockResolvedValueOnce([
        { fileId: 'one', pageId: 1 },
        { fileId: 'one', pageId: 2 },
      ])
      .mockResolvedValueOnce([{ fileId: 'one', pageId: 3 }]);
    const result = await getFileBrainCoverageQuery('org', ['one', 'empty']);
    expect(result.get('one')).toEqual({ approved: 2, candidates: 1 });
    expect(result.get('empty')).toEqual({ approved: 0, candidates: 0 });
    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(groupBy.mock.calls[0][0]).toEqual({
      by: ['fileId', 'pageId'],
      where: {
        organizationId: 'org',
        fileId: { in: ['one', 'empty'] },
        sourceDeletedAt: null,
        page: { organizationId: 'org', status: 'APPROVED' },
      },
    });
  });
  it('reads nothing for an empty authorized list', async () => {
    expect((await getFileBrainCoverageQuery('org', [])).size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
