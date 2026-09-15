import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service.js';
import { TeamRateLimitRedis } from './team-rate-limit.redis.js';

/** Per-minute, by definition — and what LiteLLM's virtual key used. */
const WINDOW_SECONDS = 60;

const rpmKey = (teamId: string) => `team:rl:rpm:${teamId}`;
const tpmKey = (teamId: string) => `team:rl:tpm:${teamId}`;

export type TeamRateLimitResult =
  | { ok: true }
  | {
      ok: false;
      scope: 'rpm' | 'tpm';
      limit: number;
      retryAfterSeconds: number;
    };

/**
 * Per-team `rpm` and `tpm` for the public API.
 *
 * **apps/api had none.** It ported apps/web's chat orchestration rather than
 * proxying to it, so when B5 removed the LiteLLM virtual keys — the only thing
 * enforcing these two fields — apps/web grew a replacement and this service did
 * not. The limits stayed visible in the team settings panel the whole time, and
 * the surface AGENTS.md calls *the* public API enforced nothing.
 *
 * It shares apps/web's Redis keys on purpose. A team's `rpm` is one allowance
 * that the panel and the API both spend, which is what the virtual key did;
 * separate windows would silently double whatever an operator set.
 *
 * **Fails open.** Redis is optional here — rate limiting is the only thing it
 * is used for — so an unreachable Redis has to mean "no per-team rate limiting"
 * rather than "no chat". The monthly cost ceiling is the hard stop, it lives in
 * Postgres, and `ApiLimitsService` checks it separately.
 */
@Injectable()
export class TeamRateLimitService {
  private readonly logger = new Logger(TeamRateLimitService.name);
  private readonly redis: TeamRateLimitRedis | null;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.redis = TeamRateLimitRedis.create(
      configService.get<string>('REDIS_URL') ?? process.env.REDIS_URL,
    );
    if (!this.redis) {
      this.logger.warn(
        'REDIS_URL is not set — per-team rate limits are not enforced',
      );
    }
  }

  /**
   * Which team a request is attributed to, and therefore whose allowance it
   * spends.
   *
   * The membership check is the point, not a formality: `x-ragen-team-id`
   * is caller-supplied, so without it an integration could spend — and exhaust
   * — the allowance of a team it has nothing to do with.
   */
  async resolveUsageTeam(input: {
    orgId: string;
    userId: string | null;
    activeTeamId?: string | null;
  }): Promise<string | null> {
    if (!input.userId) {
      return null;
    }

    if (input.activeTeamId) {
      const team = await this.prisma.client.team.findFirst({
        where: {
          id: input.activeTeamId,
          organizationId: input.orgId,
          members: { some: { userId: input.userId } },
        },
        select: { id: true },
      });
      if (team) {
        return team.id;
      }
    }

    // `take: 2` because the question is only whether there is exactly one.
    const memberships = await this.prisma.client.teamMember.findMany({
      where: { userId: input.userId, team: { organizationId: input.orgId } },
      select: { teamId: true },
      take: 2,
    });

    return memberships.length === 1 ? (memberships[0]?.teamId ?? null) : null;
  }

  async check(teamId: string | null): Promise<TeamRateLimitResult> {
    if (!teamId || !this.redis) {
      return { ok: true };
    }

    let limits: { rpmLimit: number | null; tpmLimit: number | null } | null;
    try {
      limits = await this.prisma.client.team.findUnique({
        where: { id: teamId },
        select: { rpmLimit: true, tpmLimit: true },
      });
    } catch (err) {
      this.logger.warn(
        `Could not read team rate limits for ${teamId} — allowing`,
        err,
      );
      return { ok: true };
    }

    if (!limits || (limits.rpmLimit == null && limits.tpmLimit == null)) {
      return { ok: true };
    }

    try {
      if (limits.rpmLimit != null) {
        const requests = await this.redis.incrementWithExpiry(
          rpmKey(teamId),
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
        // Read, never incremented here: the turn's token count is not knowable
        // before it runs, and charging a guess refuses real requests on
        // arithmetic nobody can audit. `charge` adds the real count afterwards,
        // so the limit bites on the next request in the window — overshooting
        // by at most one turn, as the proxy did.
        const spent = await this.redis.read(tpmKey(teamId));
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
      this.logger.warn(
        `Team rate-limit check failed for ${teamId} — allowing`,
        err,
      );
      return { ok: true };
    }
  }

  /** `check`, as a guard that refuses with the 429 the routes already speak. */
  async assertWithinLimit(teamId: string | null): Promise<void> {
    const result = await this.check(teamId);
    if (result.ok) {
      return;
    }

    this.logger.warn(
      `Request refused — team ${teamId} is over its ${result.scope} limit of ${result.limit}`,
    );

    throw new HttpException(
      {
        error: `Team ${result.scope} limit of ${result.limit} exceeded`,
        code: 429,
        scope: result.scope,
        limit: result.limit,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Add a finished turn's **actual** tokens to the team's `tpm` window.
   *
   * Never throws: attribution must not be the reason a turn fails after the
   * model has already answered it.
   */
  async charge(teamId: string | null, totalTokens: number): Promise<void> {
    if (!teamId || !this.redis || totalTokens <= 0) {
      return;
    }
    try {
      await this.redis.incrementByWithExpiry(
        tpmKey(teamId),
        totalTokens,
        WINDOW_SECONDS,
      );
    } catch (err) {
      this.logger.warn(`Could not charge token usage for team ${teamId}`, err);
    }
  }
}
