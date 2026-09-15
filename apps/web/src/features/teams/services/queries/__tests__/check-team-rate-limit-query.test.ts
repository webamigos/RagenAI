import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * This is the replacement Q3 required *before* the proxy could lose per-team
 * rate limiting — so the tests that matter most are the ones asserting a limit
 * is actually applied, and the one asserting it fails open. The two fields were
 * collected in the panel and enforced by LiteLLM for their whole life; a
 * replacement that quietly allowed everything would be indistinguishable from
 * the feature loss it exists to prevent.
 */

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockIncrWithExpire = vi.hoisted(() => vi.fn());
const mockIncrByWithExpire = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { team: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } },
}));

vi.mock('@/app/lib/services/redis', () => ({
  getRedisInstance: () => mockGetRedis(),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  TeamRateLimitError,
  assertWithinTeamRateLimit,
  chargeTeamTokenUsage,
  checkTeamRateLimitQuery,
} from '../check-team-rate-limit-query';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRedis.mockReturnValue({
    incrWithExpire: mockIncrWithExpire,
    incrByWithExpire: mockIncrByWithExpire,
    get: mockGet,
  });
  mockIncrWithExpire.mockResolvedValue(1);
  mockIncrByWithExpire.mockResolvedValue(1);
  mockGet.mockResolvedValue(null);
});

describe('when there is nothing to limit', () => {
  it('allows a turn with no team', async () => {
    await expect(checkTeamRateLimitQuery({ teamId: null })).resolves.toEqual({
      ok: true,
    });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('allows when the team has neither limit set', async () => {
    mockFindUnique.mockResolvedValue({ rpmLimit: null, tpmLimit: null });

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({ ok: true });
    expect(mockIncrWithExpire).not.toHaveBeenCalled();
  });

  it('allows when the team row is gone', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({ ok: true });
  });
});

describe('requests per minute', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue({ rpmLimit: 3, tpmLimit: null });
  });

  it('allows up to the limit', async () => {
    mockIncrWithExpire.mockResolvedValue(3);

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({ ok: true });
  });

  it('refuses the request past it, naming the limit', async () => {
    mockIncrWithExpire.mockResolvedValue(4);

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({
      ok: false,
      scope: 'rpm',
      limit: 3,
      retryAfterSeconds: 60,
    });
  });

  it('counts per team, in a 60-second window', async () => {
    await checkTeamRateLimitQuery({ teamId: 'team-1' });

    expect(mockIncrWithExpire).toHaveBeenCalledWith('team:rl:rpm:team-1', 60);
  });
});

describe('tokens per minute', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue({ rpmLimit: null, tpmLimit: 1000 });
  });

  /**
   * The check reads; it never writes. The previous version charged a
   * caller-supplied estimate, and since no caller ever supplied one, the whole
   * `tpm` branch was unreachable — a limit shown in settings and enforced
   * nowhere.
   */
  it('reads the window without charging anything', async () => {
    mockGet.mockResolvedValue('250');

    await checkTeamRateLimitQuery({ teamId: 'team-1' });

    expect(mockGet).toHaveBeenCalledWith('team:rl:tpm:team-1');
    expect(mockIncrByWithExpire).not.toHaveBeenCalled();
  });

  it('allows while the window is under the limit', async () => {
    mockGet.mockResolvedValue('999');

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({ ok: true });
  });

  it('refuses once the window has reached the limit', async () => {
    mockGet.mockResolvedValue('1000');

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({
      ok: false,
      scope: 'tpm',
      limit: 1000,
      retryAfterSeconds: 60,
    });
  });

  it('treats an empty window as nothing spent', async () => {
    mockGet.mockResolvedValue(null);

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({ ok: true });
  });
});

describe('charging a finished turn', () => {
  it('adds the real token count to the window', async () => {
    await chargeTeamTokenUsage('team-1', 432);

    expect(mockIncrByWithExpire).toHaveBeenCalledWith(
      'team:rl:tpm:team-1',
      432,
      60,
    );
  });

  it('charges nothing for organization-level work', async () => {
    await chargeTeamTokenUsage(null, 432);

    expect(mockIncrByWithExpire).not.toHaveBeenCalled();
  });

  it('charges nothing for a turn that spent nothing', async () => {
    await chargeTeamTokenUsage('team-1', 0);

    expect(mockIncrByWithExpire).not.toHaveBeenCalled();
  });

  it('never throws when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValue(null);

    await expect(chargeTeamTokenUsage('team-1', 432)).resolves.toBeUndefined();
  });

  it('never throws when Redis rejects', async () => {
    mockIncrByWithExpire.mockRejectedValue(new Error('down'));

    await expect(chargeTeamTokenUsage('team-1', 432)).resolves.toBeUndefined();
  });
});

describe('failing open', () => {
  /**
   * Redis is optional in this deployment — rate limiting is the only thing it
   * is used for. Failing closed would turn an optional dependency into a
   * required one, and the monthly cost ceiling (the hard stop) lives in
   * Postgres and is checked separately.
   */
  it('allows when Redis is not configured', async () => {
    mockGetRedis.mockReturnValue(null);

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({ ok: true });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('allows when Redis throws', async () => {
    mockFindUnique.mockResolvedValue({ rpmLimit: 1, tpmLimit: null });
    mockIncrWithExpire.mockRejectedValue(new Error('connection reset'));

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({ ok: true });
  });

  it('allows when the team lookup throws', async () => {
    mockFindUnique.mockRejectedValue(new Error('pool exhausted'));

    await expect(
      checkTeamRateLimitQuery({ teamId: 'team-1' }),
    ).resolves.toEqual({ ok: true });
  });
});

describe('the throwing guard', () => {
  it('passes a turn that is within the limit', async () => {
    mockFindUnique.mockResolvedValue({ rpmLimit: 10, tpmLimit: null });

    await expect(
      assertWithinTeamRateLimit({ teamId: 'team-1' }),
    ).resolves.toBeUndefined();
  });

  it('throws a translatable error past it', async () => {
    mockFindUnique.mockResolvedValue({ rpmLimit: 1, tpmLimit: null });
    mockIncrWithExpire.mockResolvedValue(2);

    const error = await assertWithinTeamRateLimit({
      teamId: 'team-1',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TeamRateLimitError);
    // The chat surfaces render `chain-errors.<code>`; a code with no message
    // would reach the user as a blank refusal.
    expect((error as TeamRateLimitError).code).toBe('rate-limit-exceeded');
    expect((error as TeamRateLimitError).scope).toBe('rpm');
  });
});
