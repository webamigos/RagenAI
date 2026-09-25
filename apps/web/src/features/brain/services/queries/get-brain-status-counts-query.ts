import db from '@ragenai/prisma-client';

import type {
  KnowledgeFindingStatus,
  KnowledgePageStatus,
} from '../../contracts/brain.types';

/**
 * How many pages and findings the organization has in each status, for the
 * numbers on Brain's filter chips. One `groupBy` per table, each served by
 * the `(organization_id, status…)` index those tables already have.
 */
export async function getBrainStatusCountsQuery(orgId: string): Promise<{
  pages: Record<KnowledgePageStatus, number>;
  findings: Record<KnowledgeFindingStatus, number>;
}> {
  const [pages, findings] = await Promise.all([
    db.knowledgePage.groupBy({
      by: ['status'],
      where: { organizationId: orgId },
      _count: { _all: true },
    }),
    db.knowledgeFinding.groupBy({
      by: ['status'],
      where: { organizationId: orgId },
      _count: { _all: true },
    }),
  ]);
  const pageCounts: Record<KnowledgePageStatus, number> = {
    CANDIDATE: 0,
    APPROVED: 0,
    STALE: 0,
    REJECTED: 0,
  };
  for (const row of pages) {
    pageCounts[row.status] = row._count._all;
  }
  const findingCounts: Record<KnowledgeFindingStatus, number> = {
    OPEN: 0,
    RESOLVED: 0,
    DISMISSED: 0,
  };
  for (const row of findings) {
    findingCounts[row.status] = row._count._all;
  }
  return { pages: pageCounts, findings: findingCounts };
}
