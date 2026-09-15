import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * This decides whose budget a turn lands on *and*, since the per-minute limits
 * moved into the application, which team's limit is charged. A wrong answer
 * here is a misattributed cost and a limit applied to the wrong team, neither
 * of which surfaces as an error.
 */
const mockTeamFindFirst = vi.hoisted(() => vi.fn());
const mockTeamMemberFindMany = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: { findFirst: (...a: unknown[]) => mockTeamFindFirst(...a) },
    teamMember: { findMany: (...a: unknown[]) => mockTeamMemberFindMany(...a) },
  },
}));

import { resolveUsageTeamQuery } from '../resolve-usage-team-query';

const ORG = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockTeamFindFirst.mockResolvedValue(null);
  mockTeamMemberFindMany.mockResolvedValue([]);
});

describe('without a user', () => {
  it('resolves to no team and asks the database nothing', async () => {
    await expect(
      resolveUsageTeamQuery({ orgId: ORG, userId: null }),
    ).resolves.toBeNull();

    expect(mockTeamFindFirst).not.toHaveBeenCalled();
    expect(mockTeamMemberFindMany).not.toHaveBeenCalled();
  });
});

describe('with an active team', () => {
  it('uses it when the user really is a member', async () => {
    mockTeamFindFirst.mockResolvedValue({ id: 'team-a' });

    await expect(
      resolveUsageTeamQuery({
        orgId: ORG,
        userId: 'user-1',
        activeTeamId: 'team-a',
      }),
    ).resolves.toBe('team-a');
  });

  /**
   * The active team arrives in a cookie. Without the membership filter a user
   * could bill a team they do not belong to — and now also spend that team's
   * per-minute allowance.
   */
  it('scopes the lookup to the org and the user', async () => {
    mockTeamFindFirst.mockResolvedValue({ id: 'team-a' });

    await resolveUsageTeamQuery({
      orgId: ORG,
      userId: 'user-1',
      activeTeamId: 'team-a',
    });

    expect(mockTeamFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'team-a',
          organizationId: ORG,
          members: { some: { userId: 'user-1' } },
        },
        select: { id: true },
      }),
    );
  });

  it('falls through to membership when the claim does not hold', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    mockTeamMemberFindMany.mockResolvedValue([{ teamId: 'team-real' }]);

    await expect(
      resolveUsageTeamQuery({
        orgId: ORG,
        userId: 'user-1',
        activeTeamId: 'team-forged',
      }),
    ).resolves.toBe('team-real');
  });
});

describe('falling back to membership', () => {
  it('uses the only team a user belongs to', async () => {
    mockTeamMemberFindMany.mockResolvedValue([{ teamId: 'team-only' }]);

    await expect(
      resolveUsageTeamQuery({ orgId: ORG, userId: 'user-1' }),
    ).resolves.toBe('team-only');
  });

  /** Ambiguous is not a guess: two teams means no team, not the first one. */
  it('refuses to choose between two', async () => {
    mockTeamMemberFindMany.mockResolvedValue([
      { teamId: 'team-a' },
      { teamId: 'team-b' },
    ]);

    await expect(
      resolveUsageTeamQuery({ orgId: ORG, userId: 'user-1' }),
    ).resolves.toBeNull();
  });

  it('resolves to no team when the user belongs to none', async () => {
    await expect(
      resolveUsageTeamQuery({ orgId: ORG, userId: 'user-1' }),
    ).resolves.toBeNull();
  });

  it('reads at most two rows to answer a yes/no question', async () => {
    await resolveUsageTeamQuery({ orgId: ORG, userId: 'user-1' });

    expect(mockTeamMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
  });
});
