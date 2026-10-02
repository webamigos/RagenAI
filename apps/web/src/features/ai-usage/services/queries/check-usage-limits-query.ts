import db from '@ragenai/prisma-client';
import {
  CHAT_TURN_STEP,
  evaluateCeilings,
  usageMonthStart,
} from '@ragenai/platform-contracts';
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

export async function checkUsageLimitsQuery(
  organizationId: string,
): Promise<UsageLimitStatus> {
  const monthStart = usageMonthStart();

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
       * The message ceiling counts chat turns, not every tracked call
       * (`CHAT_TURN_STEP`; the rule lives in `@ragenai/platform-contracts`).
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
          step: CHAT_TURN_STEP,
        },
      }),
      db.aiUsage.count({
        where: {
          organizationId,
          createdAt: { gte: monthStart },
          step: CHAT_TURN_STEP,
          metadata: {
            path: ['source'],
            equals: 'API',
          },
        },
      }),
    ]);

  const { exceeded, current } = evaluateCeilings(limits, {
    totalTokens: aggregates._sum.totalTokens,
    totalCostDollars: aggregates._sum.estimatedCost,
    chatMessages: chatMessageCount,
  });
  // The API request quota is a separate dimension the API surfaces read; it
  // is not one of the three spend/turn ceilings.
  const apiRequestsExceeded =
    limits.monthlyApiRequestLimit !== null &&
    apiRequestCount >= limits.monthlyApiRequestLimit;
  const tokensExceeded = exceeded.includes('tokens');
  const costExceeded = exceeded.includes('cost');
  const messagesExceeded = exceeded.includes('messages');

  return {
    limits,
    current: { ...current, apiRequests: apiRequestCount },
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
