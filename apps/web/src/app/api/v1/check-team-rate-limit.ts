import { NextResponse } from 'next/server';

import { checkTeamRateLimitQuery } from '@/features/teams/services/queries/check-team-rate-limit-query';
import { logger } from '@/app/lib/utils/logger';

/**
 * Refuse a public-API request when the caller's team is over its per-minute
 * limit.
 *
 * B5 removed the LiteLLM virtual keys that used to carry `rpm` and `tpm`, and
 * replaced them with `assertWithinTeamRateLimit` on the panel's chat path. The
 * public API resolved the same team — for attribution — and enforced nothing,
 * so an integration key kept its limits only while the proxy was in the path.
 * The limit was still displayed in settings throughout.
 *
 * Returns the response to send, or null to carry on, matching
 * `refuseIfOverUsageCeiling` beside it. The body names the scope and the limit
 * for the same reason that one does: the caller is an integration, and
 * `Retry-After` tells it when to come back rather than making it guess.
 */
export async function refuseIfOverTeamRateLimit(
  teamId: string | null,
): Promise<NextResponse | null> {
  const result = await checkTeamRateLimitQuery({ teamId });
  if (result.ok) {
    return null;
  }

  logger.warn(
    { teamId, scope: result.scope, limit: result.limit },
    'API request refused — team is over its per-minute limit',
  );

  return NextResponse.json(
    {
      error: `Team ${result.scope} limit of ${result.limit} exceeded`,
      code: 429,
      scope: result.scope,
      limit: result.limit,
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    },
  );
}
