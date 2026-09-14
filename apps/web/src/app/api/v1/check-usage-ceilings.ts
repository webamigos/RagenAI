import { NextResponse } from 'next/server';

import { checkUsageLimitsQuery } from '@/features/ai-usage/services/queries/check-usage-limits-query';
import { CHAT_USAGE_DIMENSIONS } from '@/features/ai-usage/services/queries/assert-within-usage-limits';
import { logger } from '@/app/lib/utils/logger';

/**
 * Refuse a public-API request when the organization is over a monthly ceiling.
 *
 * Returns the response to send, or null to carry on — the shape
 * `checkApiRequestLimit` established in these routes, and the same 429 body,
 * so a client that already handles one handles the other.
 *
 * The API request quota is *not* among the dimensions: it is checked by the
 * `checkApiRequestLimit` call that sits beside every call to this, and saying
 * it twice would report it twice.
 *
 * Unlike the chat surfaces, the body names which ceiling was hit. The caller
 * here is an integration, not a person mid-sentence: it can act on the
 * difference between "out of tokens" and "out of budget", and it has nowhere
 * else to read it.
 */
export async function refuseIfOverUsageCeiling(
  organizationId: string,
): Promise<NextResponse | null> {
  const status = await checkUsageLimitsQuery(organizationId);
  const exceeded = CHAT_USAGE_DIMENSIONS.filter((d) => status.exceeded[d]);

  if (exceeded.length === 0) {
    return null;
  }

  logger.warn(
    { organizationId, exceeded, current: status.current },
    'API request refused — organization is over a monthly usage ceiling',
  );

  return NextResponse.json(
    {
      error: 'Monthly usage limit exceeded',
      code: 429,
      exceeded,
      current: {
        totalTokens: status.current.totalTokens,
        totalCostCents: status.current.totalCostCents,
        totalMessages: status.current.totalMessages,
      },
      limits: {
        monthlyTokenLimit: status.limits.monthlyTokenLimit,
        monthlyCostLimitCents: status.limits.monthlyCostLimitCents,
        monthlyMessageLimit: status.limits.monthlyMessageLimit,
      },
    },
    { status: 429 },
  );
}
