import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Why adding a member is refused is a code, never a sentence (#1092). The two
 * actions that call this pass it on, and the dialog says it in the reader's
 * language, so a limit that is reported has to carry its number as a value for
 * the message rather than inside prose.
 */

const getActiveMember = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const isFeatureEnabled = vi.hoisted(() => vi.fn());
const getUsageLimits = vi.hoisted(() => vi.fn());
const memberCount = vi.hoisted(() => vi.fn());
const invitationCount = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    member: { count: memberCount },
    invitation: { count: invitationCount },
  },
}));
vi.mock('@/lib/auth-guards', () => ({ getActiveMember, getSession }));
vi.mock('@/lib/auth-access-control', () => ({
  isAppAdmin: (user?: { role?: string }) => user?.role === 'admin',
  canManageOrg: (role: string) => role === 'owner' || role === 'admin',
}));
vi.mock('@/features/organizations/services/organization-settings', () => ({
  getUsageLimits,
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: isFeatureEnabled }),
);

import { canAddMemberQuery } from '../services/queries/can-add-member-query';

const ORG = 'org-1';

describe('canAddMemberQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveMember.mockResolvedValue({ id: 'm-1', role: 'admin' });
    getSession.mockResolvedValue({
      user: { id: 'u-1', name: 'Ada', role: 'user' },
    });
    isFeatureEnabled.mockResolvedValue(true);
    getUsageLimits.mockResolvedValue({ maxMembers: null });
    memberCount.mockResolvedValue(1);
    invitationCount.mockResolvedValue(0);
  });

  it('allows an admin on a plan with room, and names the inviter', async () => {
    expect(await canAddMemberQuery(ORG)).toMatchObject({
      allowed: true,
      inviterId: 'u-1',
      inviterName: 'Ada',
    });
  });

  it('refuses someone who cannot manage the organization', async () => {
    getActiveMember.mockResolvedValue({ id: 'm-1', role: 'member' });

    expect(await canAddMemberQuery(ORG)).toEqual({
      allowed: false,
      code: 'no-permission-add-member',
    });
  });

  it('refuses when the plan does not include inviting members', async () => {
    isFeatureEnabled.mockResolvedValue(false);

    expect(await canAddMemberQuery(ORG)).toEqual({
      allowed: false,
      code: 'plan-required-for-members',
    });
  });

  it('refuses at the member limit and carries the limit as a value', async () => {
    getUsageLimits.mockResolvedValue({ maxMembers: 5 });
    memberCount.mockResolvedValue(4);
    invitationCount.mockResolvedValue(1);

    // Pending invitations count: a seat promised is a seat taken.
    expect(await canAddMemberQuery(ORG)).toEqual({
      allowed: false,
      code: 'member-limit-reached',
      params: { limit: 5 },
    });
  });

  it('allows one below the limit', async () => {
    getUsageLimits.mockResolvedValue({ maxMembers: 5 });
    memberCount.mockResolvedValue(3);
    invitationCount.mockResolvedValue(1);

    expect((await canAddMemberQuery(ORG)).allowed).toBe(true);
  });

  it('lets a platform admin past the plan and the limit', async () => {
    getSession.mockResolvedValue({ user: { id: 'u-1', role: 'admin' } });
    isFeatureEnabled.mockResolvedValue(false);
    getUsageLimits.mockResolvedValue({ maxMembers: 1 });
    memberCount.mockResolvedValue(10);

    expect((await canAddMemberQuery(ORG)).allowed).toBe(true);
  });
});
