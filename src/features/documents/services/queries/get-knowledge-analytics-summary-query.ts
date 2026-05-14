import db from '@ragenai/prisma-client';
import type { KnowledgeAnalyticsSummary } from '@/features/documents/contracts/knowledge-analytics.types';

export async function getKnowledgeAnalyticsSummaryQuery(
  orgId: string,
  days: number,
): Promise<KnowledgeAnalyticsSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const threads = await db.thread.findMany({
    where: {
      organizationId: orgId,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      userId: true,
      messages: {
        select: { id: true, rate: true },
      },
    },
  });

  const totalQuestions = threads.reduce((sum, t) => sum + t.messages.length, 0);

  const uniqueUsers = new Set(
    threads.map((t) => t.userId).filter((id): id is string => id !== null),
  ).size;

  const ratedMessages = threads
    .flatMap((t) => t.messages)
    .filter((m) => m.rate !== null);

  const positiveCount = ratedMessages.filter((m) => m.rate === 1).length;
  const positiveRatePct =
    ratedMessages.length > 0
      ? Math.round((positiveCount / ratedMessages.length) * 10000) / 100
      : 0;

  return { totalQuestions, uniqueUsers, positiveRatePct };
}
