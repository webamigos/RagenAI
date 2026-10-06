import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  member: vi.fn(),
  members: vi.fn(),
  projects: vi.fn(),
  enabled: vi.fn(),
  permission: vi.fn(),
  teams: vi.fn(),
  grants: vi.fn(),
}));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    member: { findFirst: mocks.member, findMany: mocks.members },
    project: { findMany: mocks.projects },
    teamMember: { findMany: mocks.teams },
    projectPermission: { findMany: mocks.grants },
  },
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: mocks.enabled }),
);
vi.mock(
  '@/features/projects/services/queries/resolve-project-permission-for-member',
  () => ({ resolveProjectPermissionForMember: mocks.permission }),
);
import {
  assertMcpGrantContext,
  getMcpWorkspaceOptions,
} from '../mcp-grant-context-query';
const member = {
  organizationId: 'org-a',
  role: 'member',
  user: { banned: false },
  organization: { name: 'Team A' },
};
describe('live MCP authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.member.mockResolvedValue(member);
    mocks.teams.mockResolvedValue([{ teamId: 'team-a' }]);
    mocks.grants.mockResolvedValue([{ projectId: 'public' }]);
    mocks.enabled.mockResolvedValue(true);
    mocks.permission.mockResolvedValue({ canView: true });
  });
  it('scopes membership and resolves the explicit actor permission', async () => {
    await assertMcpGrantContext('user-a', 'org-a', 'project-a');
    expect(mocks.member.mock.calls[0][0].where).toEqual({
      userId: 'user-a',
      organizationId: 'org-a',
    });
    expect(mocks.enabled).toHaveBeenCalledWith('org-a', 'mcpOAuth');
    expect(mocks.permission).toHaveBeenCalledWith(
      'project-a',
      'org-a',
      'user-a',
      'member',
    );
  });
  it.each([
    null,
    { ...member, user: { banned: true, banExpires: null } },
    {
      ...member,
      user: { banned: true, banExpires: new Date(Date.now() + 60000) },
    },
  ])('refuses removed or banned users', async (value) => {
    mocks.member.mockResolvedValue(value);
    await expect(assertMcpGrantContext('user-a', 'org-a')).rejects.toThrow(
      'unavailable',
    );
  });
  it('accepts expired bans and refuses disabled organizations', async () => {
    mocks.member.mockResolvedValue({
      ...member,
      user: { banned: true, banExpires: new Date(Date.now() - 60000) },
    });
    await expect(
      assertMcpGrantContext('user-a', 'org-a'),
    ).resolves.toBeTruthy();
    mocks.enabled.mockResolvedValue(false);
    await expect(assertMcpGrantContext('user-a', 'org-a')).rejects.toThrow(
      'unavailable',
    );
  });
  it('refuses an inaccessible assistant', async () => {
    mocks.permission.mockResolvedValue({ canView: false });
    await expect(
      assertMcpGrantContext('user-a', 'org-a', 'private'),
    ).rejects.toThrow('Assistant is unavailable');
  });
  it('offers only enabled memberships and visible assistants', async () => {
    mocks.members.mockResolvedValue([
      member,
      { ...member, organizationId: 'disabled' },
    ]);
    mocks.enabled.mockImplementation(async (org: string) => org !== 'disabled');
    mocks.projects.mockResolvedValue([
      { id: 'public', title: 'Shared', ownerId: 'other' },
      { id: 'private', title: 'Private', ownerId: 'other' },
    ]);
    mocks.permission.mockImplementation(async (project: string) => ({
      canView: project === 'public',
    }));
    expect(await getMcpWorkspaceOptions('user-a')).toEqual([
      {
        id: 'org-a',
        name: 'Team A',
        assistants: [{ id: 'public', title: 'Shared' }],
      },
    ]);
    expect(mocks.projects.mock.calls[0][0].where).toEqual({
      organizationId: 'org-a',
      isArchived: false,
    });
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.teams).toHaveBeenCalledTimes(1);
    expect(mocks.grants).toHaveBeenCalledTimes(1);
    expect(mocks.grants.mock.calls[0][0].where).toEqual({
      projectId: { in: ['public', 'private'] },
      OR: [
        { granteeType: 'user', granteeId: 'user-a' },
        { granteeType: 'team', granteeId: { in: ['team-a'] } },
      ],
    });
  });
  it.each(['member', 'admin', 'owner'])(
    'preserves workspace visibility for %s',
    async (role) => {
      mocks.members.mockResolvedValue([{ ...member, role }]);
      mocks.grants.mockResolvedValue([]);
      mocks.projects.mockResolvedValue([
        { id: 'owned', title: 'Owned', ownerId: 'user-a' },
        { id: 'legacy', title: 'Legacy', ownerId: null },
        { id: 'private', title: 'Private', ownerId: 'other' },
      ]);
      const options = await getMcpWorkspaceOptions('user-a');
      expect(options[0].assistants.map((p) => p.id)).toEqual(
        role === 'member'
          ? ['owned', 'legacy']
          : ['owned', 'legacy', 'private'],
      );
    },
  );
});
