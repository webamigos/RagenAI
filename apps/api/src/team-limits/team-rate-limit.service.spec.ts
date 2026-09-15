import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamRateLimitService } from './team-rate-limit.service.js';

/**
 * The public API had no per-team limiter at all: it ported apps/web's chat
 * orchestration rather than proxying to it, so B5 removing the LiteLLM virtual
 * keys took the only enforcement with it. These tests are mostly about the two
 * ways that failure is invisible — a limiter that always allows, and one that
 * refuses because its dependency is down.
 */
const team = { findUnique: vi.fn(), findFirst: vi.fn() };
const teamMember = { findMany: vi.fn() };
const prisma = { client: { team, teamMember } };

const redis = {
  read: vi.fn(),
  incrementWithExpiry: vi.fn(),
  incrementByWithExpiry: vi.fn(),
};

function service(withRedis: boolean = true): TeamRateLimitService {
  const s = new TeamRateLimitService(
    prisma as never,
    {
      get: () => (withRedis ? 'redis://localhost:6379' : undefined),
    } as never,
  );
  // The client is built in the constructor from config; swap in the double.
  (s as unknown as { redis: unknown }).redis = withRedis ? redis : null;
  return s;
}

beforeEach(() => {
  vi.clearAllMocks();
  redis.read.mockResolvedValue(0);
  redis.incrementWithExpiry.mockResolvedValue(1);
  redis.incrementByWithExpiry.mockResolvedValue(1);
});

describe('resolving which team pays', () => {
  it('is nobody without a user', async () => {
    await expect(
      service().resolveUsageTeam({ orgId: 'org-1', userId: null }),
    ).resolves.toBeNull();
    expect(team.findFirst).not.toHaveBeenCalled();
  });

  /**
   * `x-ragen-team-id` is caller-supplied. Without the membership filter an
   * integration could spend — and exhaust — another team's allowance.
   */
  it('scopes an active team to the org and the caller', async () => {
    team.findFirst.mockResolvedValue({ id: 'team-a' });

    await service().resolveUsageTeam({
      orgId: 'org-1',
      userId: 'user-1',
      activeTeamId: 'team-a',
    });

    expect(team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'team-a',
          organizationId: 'org-1',
          members: { some: { userId: 'user-1' } },
        },
        select: { id: true },
      }),
    );
  });

  it('falls through to membership when the claim does not hold', async () => {
    team.findFirst.mockResolvedValue(null);
    teamMember.findMany.mockResolvedValue([{ teamId: 'team-real' }]);

    await expect(
      service().resolveUsageTeam({
        orgId: 'org-1',
        userId: 'user-1',
        activeTeamId: 'team-forged',
      }),
    ).resolves.toBe('team-real');
  });

  it('refuses to choose between two teams', async () => {
    teamMember.findMany.mockResolvedValue([{ teamId: 'a' }, { teamId: 'b' }]);

    await expect(
      service().resolveUsageTeam({ orgId: 'org-1', userId: 'user-1' }),
    ).resolves.toBeNull();
  });
});

describe('requests per minute', () => {
  beforeEach(() => {
    team.findUnique.mockResolvedValue({ rpmLimit: 3, tpmLimit: null });
  });

  it('counts the request against the team window', async () => {
    await service().check('team-1');

    expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
      'team:rl:rpm:team-1',
      60,
    );
  });

  it('allows up to the limit', async () => {
    redis.incrementWithExpiry.mockResolvedValue(3);

    await expect(service().check('team-1')).resolves.toEqual({ ok: true });
  });

  it('refuses past it', async () => {
    redis.incrementWithExpiry.mockResolvedValue(4);

    await expect(service().check('team-1')).resolves.toEqual({
      ok: false,
      scope: 'rpm',
      limit: 3,
      retryAfterSeconds: 60,
    });
  });
});

describe('tokens per minute', () => {
  beforeEach(() => {
    team.findUnique.mockResolvedValue({ rpmLimit: null, tpmLimit: 1000 });
  });

  it('reads the window rather than charging a guess', async () => {
    await service().check('team-1');

    expect(redis.read).toHaveBeenCalledWith('team:rl:tpm:team-1');
    expect(redis.incrementByWithExpiry).not.toHaveBeenCalled();
  });

  it('refuses once the window has reached the limit', async () => {
    redis.read.mockResolvedValue(1000);

    await expect(service().check('team-1')).resolves.toMatchObject({
      ok: false,
      scope: 'tpm',
    });
  });

  it('charges the real count after the turn', async () => {
    await service().charge('team-1', 432);

    expect(redis.incrementByWithExpiry).toHaveBeenCalledWith(
      'team:rl:tpm:team-1',
      432,
      60,
    );
  });

  it('charges nothing for org-level work or an empty turn', async () => {
    await service().charge(null, 432);
    await service().charge('team-1', 0);

    expect(redis.incrementByWithExpiry).not.toHaveBeenCalled();
  });
});

describe('the keys it uses', () => {
  /**
   * The same keys as apps/web, deliberately. A team's allowance is one budget
   * that the panel and the API both spend — which is what the virtual key did.
   * Separate windows would silently double every limit an operator set.
   */
  it('shares apps/web spelling exactly', async () => {
    team.findUnique.mockResolvedValue({ rpmLimit: 1, tpmLimit: 1 });

    await service().check('t');
    await service().charge('t', 5);

    expect(redis.incrementWithExpiry).toHaveBeenCalledWith('team:rl:rpm:t', 60);
    expect(redis.read).toHaveBeenCalledWith('team:rl:tpm:t');
    expect(redis.incrementByWithExpiry).toHaveBeenCalledWith(
      'team:rl:tpm:t',
      5,
      60,
    );
  });
});

describe('failing open', () => {
  /**
   * Redis is optional here — rate limiting is the only thing it is used for.
   * Failing closed would turn an optional dependency into a required one and
   * take chat down with it; the monthly cost ceiling is the hard stop and it
   * lives in Postgres.
   */
  it('allows when Redis is not configured', async () => {
    await expect(service(false).check('team-1')).resolves.toEqual({ ok: true });
  });

  it('allows when Redis rejects', async () => {
    team.findUnique.mockResolvedValue({ rpmLimit: 1, tpmLimit: null });
    redis.incrementWithExpiry.mockRejectedValue(new Error('down'));

    await expect(service().check('team-1')).resolves.toEqual({ ok: true });
  });

  it('allows when the team row cannot be read', async () => {
    team.findUnique.mockRejectedValue(new Error('db down'));

    await expect(service().check('team-1')).resolves.toEqual({ ok: true });
  });

  it('allows a team with no limits set', async () => {
    team.findUnique.mockResolvedValue({ rpmLimit: null, tpmLimit: null });

    await expect(service().check('team-1')).resolves.toEqual({ ok: true });
    expect(redis.incrementWithExpiry).not.toHaveBeenCalled();
  });

  it('never throws while charging', async () => {
    redis.incrementByWithExpiry.mockRejectedValue(new Error('down'));

    await expect(service().charge('team-1', 9)).resolves.toBeUndefined();
  });
});

describe('the guard', () => {
  it('throws a 429 carrying the scope and the limit', async () => {
    team.findUnique.mockResolvedValue({ rpmLimit: 1, tpmLimit: null });
    redis.incrementWithExpiry.mockResolvedValue(2);

    await expect(service().assertWithinLimit('team-1')).rejects.toBeInstanceOf(
      HttpException,
    );

    try {
      await service().assertWithinLimit('team-1');
    } catch (err) {
      const response = (err as HttpException).getResponse();
      expect((err as HttpException).getStatus()).toBe(429);
      expect(response).toMatchObject({ scope: 'rpm', limit: 1, code: 429 });
    }
  });

  it('is silent when the team is within its limit', async () => {
    team.findUnique.mockResolvedValue({ rpmLimit: 10, tpmLimit: null });

    await expect(
      service().assertWithinLimit('team-1'),
    ).resolves.toBeUndefined();
  });
});
