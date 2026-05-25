import db from '@ragenai/prisma-client';
import { LeadEnrichmentStatus } from '@/generated/prisma/client';
import {
  NOT_FOUND_ERROR_MARKER,
  type LeadListSummary,
} from '../../contracts/lead-list.types';

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
  const [grouped, notFoundRows] = await Promise.all([
    db.lead.groupBy({
      by: ['leadListId', 'enrichmentStatus'],
      where: { leadListId: { in: ids } },
      _count: { _all: true },
    }),
    // "Not found" leads have status=failed + enrichmentError=marker, but
    // semantically they're a soft warning (company isn't in KRS), not an
    // error. Exclude them from failedCount so the list index doesn't show
    // them as red failures.
    db.lead.groupBy({
      by: ['leadListId'],
      where: {
        leadListId: { in: ids },
        enrichmentStatus: LeadEnrichmentStatus.failed,
        enrichmentError: NOT_FOUND_ERROR_MARKER,
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<
    number,
    { pending: number; enriched: number; failed: number; notFound: number }
  >();
  for (const id of ids) {
    counts.set(id, { pending: 0, enriched: 0, failed: 0, notFound: 0 });
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
  for (const row of notFoundRows) {
    const entry = counts.get(row.leadListId);
    if (entry) {
      entry.notFound = row._count._all;
    }
  }

  return lists.map((l) => {
    const c = counts.get(l.id) ?? {
      pending: 0,
      enriched: 0,
      failed: 0,
      notFound: 0,
    };
    return {
      ...l,
      pendingCount: c.pending,
      // Subtract not-found from the hard failure count so the list index
      // doesn't show NotFound leads as red errors.
      enrichedCount: c.enriched,
      failedCount: Math.max(0, c.failed - c.notFound),
      notFoundCount: c.notFound,
    };
  });
};
