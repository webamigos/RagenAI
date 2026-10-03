import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  teamUpsert: vi.fn(),
  teamMemberFindFirst: vi.fn(),
  teamMemberCreate: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: { upsert: (...a: unknown[]) => m.teamUpsert(...a) },
    teamMember: {
      findFirst: (...a: unknown[]) => m.teamMemberFindFirst(...a),
      create: (...a: unknown[]) => m.teamMemberCreate(...a),
    },
  },
}));

import { isTenantScopeSatisfied } from '@ragenai/platform-contracts';
import { ensureDefaultTeamMembershipCommand } from '../ensure-default-team-membership-command';

beforeEach(() => {
  vi.clearAllMocks();
  m.teamUpsert.mockResolvedValue({});
  m.teamMemberFindFirst.mockResolvedValue(null);
  m.teamMemberCreate.mockResolvedValue({});
});

describe('ensureDefaultTeamMembershipCommand', () => {
  it('upserts the General team inside the organization and adds the user', async () => {
    const result = await ensureDefaultTeamMembershipCommand('org-1', 'user-1');

    const args = m.teamUpsert.mock.calls[0][0];
    expect(args.where).toEqual({
      id: 'org-1-general',
      organizationId: 'org-1',
    });
    expect(args.create).toMatchObject({
      id: 'org-1-general',
      organizationId: 'org-1',
    });
    expect(isTenantScopeSatisfied('Team', 'upsert', args)).toBe(true);
    expect(m.teamMemberCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 'org-1-general',
        userId: 'user-1',
      }),
    });
    expect(result).toEqual({ teamId: 'org-1-general', joined: true });
  });

  it('carries on to the membership when a concurrent call created the team first', async () => {
    // With organizationId beside the unique id, Prisma reads then inserts,
    // so the loser of a race gets P2002 for a team that now exists.
    m.teamUpsert.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const result = await ensureDefaultTeamMembershipCommand('org-1', 'user-1');

    expect(m.teamMemberCreate).toHaveBeenCalledTimes(1);
    expect(result.joined).toBe(true);
  });

  it('rethrows any other failure', async () => {
    m.teamUpsert.mockRejectedValue(
      Object.assign(new Error('connection lost'), { code: 'P1001' }),
    );

    await expect(
      ensureDefaultTeamMembershipCommand('org-1', 'user-1'),
    ).rejects.toThrow('connection lost');
    expect(m.teamMemberCreate).not.toHaveBeenCalled();
  });

  it('reports the membership a concurrent call created between the read and the insert', async () => {
    m.teamMemberFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'tm-1' });
    m.teamMemberCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    const result = await ensureDefaultTeamMembershipCommand('org-1', 'user-1');

    expect(result).toEqual({ teamId: 'org-1-general', joined: false });
  });

  it('rethrows a P2002 on the membership when no membership is there after all', async () => {
    m.teamMemberCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );

    await expect(
      ensureDefaultTeamMembershipCommand('org-1', 'user-1'),
    ).rejects.toThrow('Unique constraint failed');
  });

  it('adds nobody when the user is already in the team', async () => {
    m.teamMemberFindFirst.mockResolvedValue({ id: 'tm-1' });

    const result = await ensureDefaultTeamMembershipCommand('org-1', 'user-1');

    expect(m.teamMemberCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ teamId: 'org-1-general', joined: false });
  });
});
