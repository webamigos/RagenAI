/* eslint-disable no-var */
var mockOrganizationFindMany: jest.Mock;
var mockRetrievalDeleteMany: jest.Mock;
/* eslint-enable no-var */

jest.mock('../prisma', () => ({
  getPrisma: () => ({
    organization: {
      findMany: (...args: unknown[]) => mockOrganizationFindMany(...args),
    },
    documentRetrieval: {
      deleteMany: (...args: unknown[]) => mockRetrievalDeleteMany(...args),
    },
  }),
}));

jest.mock('../../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { db } from '../db';

const CUTOFF = new Date('2026-03-03T03:30:00Z');

type DeleteArgs = { where: { orgId: string; createdAt: { lt: Date } } };

function deleteCalls(): DeleteArgs[] {
  return mockRetrievalDeleteMany.mock.calls.map(
    (call) => call[0] as DeleteArgs,
  );
}

describe('deleteExpiredDocumentRetrievals', () => {
  beforeEach(() => {
    mockOrganizationFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'org-a' }, { id: 'org-b' }]);
    mockRetrievalDeleteMany = jest.fn().mockResolvedValue({ count: 4 });
  });

  /**
   * The assertion this file exists for.
   *
   * A single unscoped `deleteMany({ where: { createdAt: { lt } } })` is the
   * obvious implementation and is wrong twice over: `deleteMany` is a guarded
   * operation, so it logs a tenant-scope violation on every nightly run and
   * blocks outright once the guard throws; and the table's only usable index
   * is `(org_id, created_at)`, which a bare `created_at` filter cannot use.
   */
  it('deletes once per organization, never once globally', async () => {
    await db.deleteExpiredDocumentRetrievals(CUTOFF);

    expect(deleteCalls()).toEqual([
      { where: { orgId: 'org-a', createdAt: { lt: CUTOFF } } },
      { where: { orgId: 'org-b', createdAt: { lt: CUTOFF } } },
    ]);
  });

  it('gives every delete an org scope', async () => {
    await db.deleteExpiredDocumentRetrievals(CUTOFF);

    for (const call of deleteCalls()) {
      expect(typeof call.where.orgId).toBe('string');
      expect(call.where.orgId.length).toBeGreaterThan(0);
    }
  });

  it('sums the deletions and reports how many tenants it walked', async () => {
    const result = await db.deleteExpiredDocumentRetrievals(CUTOFF);

    expect(result).toEqual({ organizationsScanned: 2, retrievalsDeleted: 8 });
  });

  it('does nothing when there are no organizations', async () => {
    mockOrganizationFindMany.mockResolvedValue([]);

    const result = await db.deleteExpiredDocumentRetrievals(CUTOFF);

    expect(mockRetrievalDeleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ organizationsScanned: 0, retrievalsDeleted: 0 });
  });

  /**
   * Organizations come from the organization table rather than from
   * `SELECT DISTINCT org_id FROM document_retrievals`, which would be a
   * cross-tenant read — the thing both the runtime guard and
   * `raw-sql-carries-its-org-filter.test.ts` refuse. The cost is a no-op
   * delete for a tenant with nothing to prune.
   */
  it('still asks each organization, including ones with nothing to delete', async () => {
    mockRetrievalDeleteMany.mockResolvedValue({ count: 0 });

    const result = await db.deleteExpiredDocumentRetrievals(CUTOFF);

    expect(deleteCalls()).toHaveLength(2);
    expect(result.retrievalsDeleted).toBe(0);
  });
});
