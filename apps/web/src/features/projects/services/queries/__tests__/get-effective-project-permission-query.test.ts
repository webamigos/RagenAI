import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProjectFindFirst = vi.fn();
const mockTeamMemberFindMany = vi.fn();
const mockProjectPermissionFindMany = vi.fn();
const mockGetActiveMember = vi.fn();

vi.mock('@/lib/auth-guards', () => ({
  getActiveMember: (...args: unknown[]) => mockGetActiveMember(...args),
}));

vi.mock('@/lib/auth-access-control', () => ({
  canManageOrg: (role: string) => role === 'admin' || role === 'owner',
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    teamMember: {
      findMany: (...args: unknown[]) => mockTeamMemberFindMany(...args),
    },
    projectPermission: {
      findMany: (...args: unknown[]) => mockProjectPermissionFindMany(...args),
    },
  },
}));

import { getEffectiveProjectPermissionQuery } from '../get-effective-project-permission-query';

const ORG = 'org-1';
const PROJECT = 'proj-1';

describe('getEffectiveProjectPermissionQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeamMemberFindMany.mockResolvedValue([]);
    mockProjectPermissionFindMany.mockResolvedValue([]);
    mockGetActiveMember.mockResolvedValue(null);
  });

  it('returns no access when project missing', async () => {
    mockProjectFindFirst.mockResolvedValue(null);
    const res = await getEffectiveProjectPermissionQuery(PROJECT, ORG, 'u');
    expect(res.canView).toBe(false);
    expect(res.source).toBe('none');
  });

  it('owner gets full management + share + delete', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT, ownerId: 'u' });
    const res = await getEffectiveProjectPermissionQuery(PROJECT, ORG, 'u');
    expect(res).toEqual({
      canView: true,
      canManage: true,
      canShare: true,
      canDelete: true,
      source: 'owner',
    });
  });

  it('org admin can manage and share even without ownership', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
    mockGetActiveMember.mockResolvedValue({ role: 'admin' });
    const res = await getEffectiveProjectPermissionQuery(PROJECT, ORG, 'u');
    expect(res.canShare).toBe(true);
    expect(res.source).toBe('orgAdmin');
  });

  it('legacy ownerless project is view-only for org members', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT, ownerId: null });
    mockGetActiveMember.mockResolvedValue({ role: 'member' });
    const res = await getEffectiveProjectPermissionQuery(PROJECT, ORG, 'u');
    expect(res.canView).toBe(true);
    expect(res.canManage).toBe(false);
    expect(res.canShare).toBe(false);
  });

  it('direct view share grants view but not manage', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
    mockProjectPermissionFindMany.mockResolvedValue([
      { permission: 'view', granteeType: 'user' },
    ]);
    const res = await getEffectiveProjectPermissionQuery(PROJECT, ORG, 'u');
    expect(res.canView).toBe(true);
    expect(res.canManage).toBe(false);
    expect(res.canShare).toBe(false);
    expect(res.source).toBe('directShare');
  });

  it('full share grants manage but not share/delete', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
    mockProjectPermissionFindMany.mockResolvedValue([
      { permission: 'full', granteeType: 'user' },
    ]);
    const res = await getEffectiveProjectPermissionQuery(PROJECT, ORG, 'u');
    expect(res.canManage).toBe(true);
    expect(res.canShare).toBe(false);
    expect(res.canDelete).toBe(false);
  });

  it('team share is resolved via team membership', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
    mockTeamMemberFindMany.mockResolvedValue([{ teamId: 'team-1' }]);
    mockProjectPermissionFindMany.mockResolvedValue([
      { permission: 'view', granteeType: 'team' },
    ]);
    const res = await getEffectiveProjectPermissionQuery(PROJECT, ORG, 'u');
    expect(res.canView).toBe(true);
    expect(res.source).toBe('teamShare');
  });

  it('returns no access when user has neither ownership nor a grant', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: PROJECT, ownerId: 'owner' });
    const res = await getEffectiveProjectPermissionQuery(PROJECT, ORG, 'u');
    expect(res.canView).toBe(false);
    expect(res.source).toBe('none');
  });
});
