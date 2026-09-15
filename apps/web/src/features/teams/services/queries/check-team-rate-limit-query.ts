import 'server-only';

import db from '@ragenai/prisma-client';
import { ChainError } from '@/libs/chains/errors';
import { getRedisInstance } from '@/app/lib/services/redis';
import { logger } from '@/app/lib/utils/logger';

const WINDOW_SECONDS = 60;

/**
 * Carries the same `chain-errors.*` translation-key contract the monthly
 * ceiling uses, so the chat surfaces need no new error handling — only a new
 * key, because "wait a moment" and "wait for next month" are different advice.
 */
export class TeamRateLimitError extends ChainError {
  constructor(
    public readonly scope: 'rpm' | 'tpm',
    public readonly limit: number,
    public readonly retryAfterSeconds: number,
  ) {
    super(`Team ${scope} limit of ${limit} exceeded`, 'rate-limit-exceeded');
    this.name = 'TeamRateLimitError';
  }
}

export type TeamRateLimitResult =
  | { ok: true }
  | {
      ok: false;
      scope: 'rpm' | 'tpm';
      limit: number;
      retryAfterSeconds: number;
    };

/**
 * Per-team requests- and tokens-per-minute, enforced here rather than by the
 * proxy.
 *
 * **This exists because B5 removed the only thing that enforced it.** The two
 * fields have always been collected in the team settings panel and always been
 * enforced by LiteLLM, on the virtual key — which is precisely why
 * [Q3](../../../../../../docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md)
 * kept syncing them to the proxy after budgets and allowlists moved into the
 * database, and why it said in the same breath that Phase B has to reimplement
 * them *before* the proxy goes. Deleting the keys without this would have left
 * two fields in the UI that do nothing — the exact shape the whole phase exists
 * to remove, and the shape the monthly ceilings were in for five months.
 *
 * A fixed 60-second window rather than a sliding one, matching what LiteLLM
 * did: `rpm` and `tpm` are per-minute by definition, and a sliding window
 * would change the meaning of a number an operator already set.
 *
 * **Fails open when Redis is unavailable.** Redis is optional in this
 * deployment (rate limiting is the only thing it is used for), so a missing or
 * broken Redis has to mean "no per-team rate limiting" rather than "no chat" —
 * the monthly cost ceiling is the hard stop, it lives in Postgres, and it is
 * checked separately. Failing closed here would turn an optional dependency
 * into a required one.
 */
export async function checkTeamRateLimitQuery({
  teamId,
  estimatedTokens = 0,
}: {
  teamId: string | null;
  /**
   * Tokens this turn is expected to spend, for the `tpm` bucket. Zero is a
   * legitimate caller — the request bucket still applies, and a turn whose
   * size is not yet known should not be charged a guess.
   */
  estimatedTokens?: number;
}): Promise<TeamRateLimitResult> {
  if (!teamId) {
    return { ok: true };
  }

  const redis = getRedisInstance();
  if (!redis) {
    return { ok: true };
  }

  let limits: { rpmLimit: number | null; tpmLimit: number | null } | null;
  try {
    limits = await db.team.findUnique({
      where: { id: teamId },
      select: { rpmLimit: true, tpmLimit: true },
    });
  } catch (err) {
    logger.warn({ err, teamId }, 'Could not read team rate limits — allowing');
    return { ok: true };
  }

  if (!limits || (limits.rpmLimit == null && limits.tpmLimit == null)) {
    return { ok: true };
  }

  try {
    if (limits.rpmLimit != null) {
      const requests = await redis.incrWithExpire(
        `team:rl:rpm:${teamId}`,
        WINDOW_SECONDS,
      );
      if (requests > limits.rpmLimit) {
        return {
          ok: false,
          scope: 'rpm',
          limit: limits.rpmLimit,
          retryAfterSeconds: WINDOW_SECONDS,
        };
      }
    }

    if (limits.tpmLimit != null && estimatedTokens > 0) {
      // Counted *before* the turn, from an estimate, because a limit applied
      // after the tokens are spent is an accounting entry rather than a limit.
      // It therefore overshoots by at most one turn, which is what the proxy
      // did too.
      const tokens = await redis.incrByWithExpire(
        `team:rl:tpm:${teamId}`,
        estimatedTokens,
        WINDOW_SECONDS,
      );
      if (tokens > limits.tpmLimit) {
        return {
          ok: false,
          scope: 'tpm',
          limit: limits.tpmLimit,
          retryAfterSeconds: WINDOW_SECONDS,
        };
      }
    }

    return { ok: true };
  } catch (err) {
    logger.warn({ err, teamId }, 'Team rate-limit check failed — allowing');
    return { ok: true };
  }
}

/** `checkTeamRateLimitQuery`, as a guard that throws. */
export async function assertWithinTeamRateLimit(input: {
  teamId: string | null;
  estimatedTokens?: number;
}): Promise<void> {
  const result = await checkTeamRateLimitQuery(input);
  if (!result.ok) {
    logger.warn(
      { teamId: input.teamId, scope: result.scope, limit: result.limit },
      'Request refused — team is over its per-minute limit',
    );
    throw new TeamRateLimitError(
      result.scope,
      result.limit,
      result.retryAfterSeconds,
    );
  }
}
