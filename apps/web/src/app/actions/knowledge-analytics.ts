'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { withRedisCache } from '@/app/lib/services/redis-cache';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type {
  KnowledgeAnalyticsDashboardData,
  KnowledgeAnalyticsSummary,
  DailyQuestion,
  TopCitedDocument,
  UnusedDocument,
  NegativeQaResult,
} from '@/features/documents/contracts/knowledge-analytics.types';

const CACHE_TTL = 3600;

async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
}

export async function getKnowledgeAnalyticsDashboard(
  days: number = 30,
): Promise<KnowledgeAnalyticsDashboardData> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const userId = await requireUserId();

  const [summary, dailyQuestions, topCited, unusedDocs, negativeQa] =
    await Promise.all([
      withRedisCache(
        `knowledge-analytics:${orgId}:summary:${days}`,
        CACHE_TTL,
        () =>
          ragenApiRequest<KnowledgeAnalyticsSummary>({
            method: 'GET',
            path: '/v1/internal/knowledge-analytics/summary',
            userId,
            orgId,
            query: { days },
          }),
      ),
      withRedisCache(
        `knowledge-analytics:${orgId}:daily-questions:${days}`,
        CACHE_TTL,
        () =>
          ragenApiRequest<DailyQuestion[]>({
            method: 'GET',
            path: '/v1/internal/knowledge-analytics/daily-questions',
            userId,
            orgId,
            query: { days },
          }),
      ),
      withRedisCache(`knowledge-analytics:${orgId}:top-cited`, CACHE_TTL, () =>
        ragenApiRequest<TopCitedDocument[]>({
          method: 'GET',
          path: '/v1/internal/knowledge-analytics/top-cited-documents',
          userId,
          orgId,
        }),
      ),
      withRedisCache(
        `knowledge-analytics:${orgId}:unused-docs`,
        CACHE_TTL,
        () =>
          ragenApiRequest<UnusedDocument[]>({
            method: 'GET',
            path: '/v1/internal/knowledge-analytics/unused-documents',
            userId,
            orgId,
          }),
      ),
      withRedisCache(
        `knowledge-analytics:${orgId}:negative-qa:${days}:1`,
        CACHE_TTL,
        () =>
          ragenApiRequest<NegativeQaResult>({
            method: 'GET',
            path: '/v1/internal/messages/negative-qa',
            userId,
            orgId,
            query: { days, page: 1 },
          }),
      ),
    ]);

  return { summary, dailyQuestions, topCited, unusedDocs, negativeQa };
}

export async function getNegativeQaPage(
  days: number = 30,
  page: number = 1,
): Promise<NegativeQaResult> {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);
  const userId = await requireUserId();

  return withRedisCache(
    `knowledge-analytics:${orgId}:negative-qa:${days}:${page}`,
    CACHE_TTL,
    () =>
      ragenApiRequest<NegativeQaResult>({
        method: 'GET',
        path: '/v1/internal/messages/negative-qa',
        userId,
        orgId,
        query: { days, page },
      }),
  );
}
