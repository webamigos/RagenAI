import db from '@ragenai/prisma-client';
import { FINDING_TYPE_FILTERS } from '../../constants';
import type {
  KnowledgeFindingStatus,
  KnowledgeFindingType,
} from '../../contracts/brain.types';
import {
  findingsInScope,
  type BrainLanguageScope,
} from './brain-language-scope';

export async function getFindingTypeCountsQuery(
  orgId: string,
  status: KnowledgeFindingStatus,
  scope: BrainLanguageScope | null = null,
): Promise<Record<KnowledgeFindingType, number>> {
  const rows = await db.knowledgeFinding.groupBy({
    by: ['type'],
    where: {
      organizationId: orgId,
      status,
      ...(scope ? findingsInScope(scope) : {}),
    },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(
    FINDING_TYPE_FILTERS.map((type) => [type, 0]),
  ) as Record<KnowledgeFindingType, number>;
  for (const row of rows) {
    counts[row.type] = row._count._all;
  }
  return counts;
}
