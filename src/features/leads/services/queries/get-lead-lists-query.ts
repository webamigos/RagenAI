import db from '@ragenai/prisma-client';
import { LeadEnrichmentStatus } from '@/generated/prisma/client';
import type { LeadListSummary } from '../../contracts/lead-list.types';

export const getLeadListsQuery = async (
  organizationId: string,
): Promise<LeadListSummary[]> => {
  const lists = await db.leadList.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      publicId: true,
      name: true,
      rowCount: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
    },
  });

  if (lists.length === 0) {
    return [];
  }

  const ids = lists.map((l) => l.id);
  const grouped = await db.lead.groupBy({
    by: ['leadListId', 'enrichmentStatus'],
    where: { leadListId: { in: ids } },
    _count: { _all: true },
  });

  const counts = new Map<number, { pending: number; enriched: number; failed: number }>();
  for (const id of ids) {
    counts.set(id, { pending: 0, enriched: 0, failed: 0 });
  }
  for (const row of grouped) {
    const entry = counts.get(row.leadListId);
    if (!entry) {
      continue;
    }
    if (row.enrichmentStatus === LeadEnrichmentStatus.pending) {
      entry.pending = row._count._all;
    } else if (row.enrichmentStatus === LeadEnrichmentStatus.enriched) {
      entry.enriched = row._count._all;
    } else if (row.enrichmentStatus === LeadEnrichmentStatus.failed) {
      entry.failed = row._count._all;
    }
  }

  return lists.map((l) => {
    const c = counts.get(l.id) ?? { pending: 0, enriched: 0, failed: 0 };
    return {
      ...l,
      pendingCount: c.pending,
      enrichedCount: c.enriched,
      failedCount: c.failed,
    };
  });
};
