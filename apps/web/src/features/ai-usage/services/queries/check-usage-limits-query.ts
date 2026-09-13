import db from '@ragenai/prisma-client';
import { AiUsageStep } from '@/generated/prisma/client';
import { getUsageLimits } from '@/features/organizations/services/organization-settings';
import type { UsageLimits } from '@/features/organizations/contracts/organization.types';

export type UsageLimitStatus = {
  limits: UsageLimits;
  current: {
    totalTokens: number;
    totalCostCents: number;
    totalMessages: number;
    apiRequests: number;
  };
  exceeded: {
    tokens: boolean;
    cost: boolean;
    messages: boolean;
    apiRequests: boolean;
  };
  isAnyLimitExceeded: boolean;
};

function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function checkUsageLimitsQuery(
  organizationId: string,
): Promise<UsageLimitStatus> {
  const monthStart = getMonthStart();

  const [limits, aggregates, chatMessageCount, apiRequestCount] =
    await Promise.all([
      getUsageLimits(organizationId),
      db.aiUsage.aggregate({
        where: {
          organizationId: organizationId,
          createdAt: { gte: monthStart },
        },
        _sum: {
          totalTokens: true,
          estimatedCost: true,
        },
      }),
      /**
       * The message ceiling counts chat turns, not every tracked call.
       *
       * Tokens and cost are spend, so they aggregate everything — embeddings
       * and reranking cost money. "Monthly Message Limit" is a count of
       * conversations and the admin panel suggests 500 for it, while one
       * document ingest writes an `AiUsage` row per embedded chunk. This used
       * to be `_count: true` over all rows, which would have refused chats
       * because somebody uploaded a PDF. Nothing read it — the query had no
       * callers — so correcting it is part of making it safe to call.
       */
      db.aiUsage.count({
        where: {
          organizationId,
          createdAt: { gte: monthStart },
          step: AiUsageStep.CHAT_COMPLETION,
        },
      }),
      db.aiUsage.count({
        where: {
          organizationId,
          createdAt: { gte: monthStart },
          step: AiUsageStep.CHAT_COMPLETION,
          metadata: {
            path: ['source'],
            equals: 'API',
          },
        },
      }),
    ]);

  const totalTokens = aggregates._sum.totalTokens ?? 0;
  const totalCost = aggregates._sum.estimatedCost ?? 0;
  const totalCostCents = Math.round(totalCost * 100);
  const totalMessages = chatMessageCount;

  const tokensExceeded =
    limits.monthlyTokenLimit !== null &&
    totalTokens >= limits.monthlyTokenLimit;
  const costExceeded =
    limits.monthlyCostLimitCents !== null &&
    totalCostCents >= limits.monthlyCostLimitCents;
  const messagesExceeded =
    limits.monthlyMessageLimit !== null &&
    totalMessages >= limits.monthlyMessageLimit;
  const apiRequestsExceeded =
    limits.monthlyApiRequestLimit !== null &&
    apiRequestCount >= limits.monthlyApiRequestLimit;

  return {
    limits,
    current: {
      totalTokens,
      totalCostCents,
      totalMessages,
      apiRequests: apiRequestCount,
    },
    exceeded: {
      tokens: tokensExceeded,
      cost: costExceeded,
      messages: messagesExceeded,
      apiRequests: apiRequestsExceeded,
    },
    isAnyLimitExceeded:
      tokensExceeded || costExceeded || messagesExceeded || apiRequestsExceeded,
  };
}
