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
}: {
  teamId: string | null;
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

    if (limits.tpmLimit != null) {
      // Read, never incremented here. The turn's token count is not knowable
      // before it runs, and charging a guess refuses real requests on
      // arithmetic nobody can audit — so the window is charged afterwards,
      // from the usage row, by `chargeTeamTokenUsage`.
      //
      // The limit therefore bites on the *next* request in the window rather
      // than this one, overshooting by at most one turn. That is what the
      // proxy did too, and it is the price of counting real tokens instead of
      // imagined ones.
      const spent = Number((await redis.get(`team:rl:tpm:${teamId}`)) ?? 0);
      if (spent >= limits.tpmLimit) {
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

/**
 * Add a finished turn's **actual** tokens to the team's `tpm` window.
 *
 * Separated from the check because the two cannot happen at the same moment:
 * the limit has to be evaluated before the model runs, and the only honest
 * token count exists after it. Pairing a pre-turn read with a post-turn charge
 * keeps the arithmetic auditable — every token in the window was really spent
 * — at the cost of letting one turn over the line.
 *
 * Fails open and silently, for the same reason the check does: Redis is
 * optional here, and a deployment without it must still answer chat.
 */
export async function chargeTeamTokenUsage(
  teamId: string | null,
  totalTokens: number,
): Promise<void> {
  if (!teamId || totalTokens <= 0) {
    return;
  }

  const redis = getRedisInstance();
  if (!redis) {
    return;
  }

  try {
    await redis.incrByWithExpire(
      `team:rl:tpm:${teamId}`,
      totalTokens,
      WINDOW_SECONDS,
    );
  } catch (err) {
    logger.warn({ err, teamId }, 'Could not charge team token usage');
  }
}
