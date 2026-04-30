'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { withRedisCache } from '@/app/lib/services/redis-cache';
import { getKnowledgeAnalyticsSummaryQuery } from '@/features/documents/services/queries/get-knowledge-analytics-summary-query';
import { getTopCitedDocumentsQuery } from '@/features/documents/services/queries/get-top-cited-documents-query';
import { getUnusedDocumentsQuery } from '@/features/documents/services/queries/get-unused-documents-query';
import { getNegativeQaQuery } from '@/features/messages/services/queries/get-negative-qa-query';
import type { KnowledgeAnalyticsDashboardData } from '@/features/documents/contracts/knowledge-analytics.types';

const CACHE_TTL = 3600;

export async function getKnowledgeAnalyticsDashboard(
  days: number = 30,
): Promise<KnowledgeAnalyticsDashboardData> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const [summary, topCited, unusedDocs, negativeQa] = await Promise.all([
    withRedisCache(
      `knowledge-analytics:${orgId}:summary:${days}`,
      CACHE_TTL,
      () => getKnowledgeAnalyticsSummaryQuery(orgId, days),
    ),
    withRedisCache(`knowledge-analytics:${orgId}:top-cited`, CACHE_TTL, () =>
      getTopCitedDocumentsQuery(orgId),
    ),
    withRedisCache(`knowledge-analytics:${orgId}:unused-docs`, CACHE_TTL, () =>
      getUnusedDocumentsQuery(orgId),
    ),
    withRedisCache(
      `knowledge-analytics:${orgId}:negative-qa:${days}`,
      CACHE_TTL,
      () => getNegativeQaQuery(orgId, days),
    ),
  ]);

  return { summary, topCited, unusedDocs, negativeQa };
}
