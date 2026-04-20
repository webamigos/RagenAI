import db from '@ragenai/prisma-client';
import { AiUsageStep } from '@/generated/prisma/client';
import { getUsageLimits } from '@/features/organizations/services/organization-settings';

export type ApiLimitStatus = {
  exceeded: boolean;
  current: number;
  limit: number | null;
};

function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function checkApiRequestLimit(
  organizationId: string,
): Promise<ApiLimitStatus> {
  const limits = await getUsageLimits(organizationId);

  if (limits.monthlyApiRequestLimit === null) {
    return { exceeded: false, current: 0, limit: null };
  }

  const count = await db.aiUsage.count({
    where: {
      organizationId,
      createdAt: { gte: getMonthStart() },
      step: AiUsageStep.CHAT_COMPLETION,
      metadata: {
        path: ['source'],
        equals: 'API',
      },
    },
  });

  return {
    exceeded: count >= limits.monthlyApiRequestLimit,
    current: count,
    limit: limits.monthlyApiRequestLimit,
  };
}
