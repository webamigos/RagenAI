import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockTeamMembers,
  mockPermissions,
  mockProjects,
  mockGetOrgId,
  mockGetUserId,
} = vi.hoisted(() => ({
  mockTeamMembers: vi.fn(),
  mockPermissions: vi.fn(),
  mockProjects: vi.fn(),
  mockGetOrgId: vi.fn(),
  mockGetUserId: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    teamMember: { findMany: mockTeamMembers },
    projectPermission: { findMany: mockPermissions },
    project: { findMany: mockProjects },
  },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: mockGetOrgId,
  getCurrentUserId: mockGetUserId,
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getUserProjectsQuery } from '../get-user-projects-query';

beforeEach(() => {
  mockTeamMembers.mockReset().mockResolvedValue([]);
  mockPermissions.mockReset().mockResolvedValue([]);
  mockProjects.mockReset().mockResolvedValue([]);
  mockGetOrgId.mockReset().mockResolvedValue('org-session');
  mockGetUserId.mockReset().mockResolvedValue('user-session');
});

describe('getUserProjectsQuery and the tenant scope', () => {
  // Client components import this 'use server' module, so the function is a
  // Server Action and its arguments are the caller's to choose. The
  // organization and the user must be the session's.
  it('scopes every read to the session organization and user', async () => {
    await getUserProjectsQuery();

    expect(mockProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-session',
          OR: expect.arrayContaining([{ ownerId: 'user-session' }]),
        }),
      }),
    );
    expect(mockPermissions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: { organizationId: 'org-session' },
        }),
      }),
    );
    expect(mockTeamMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-session',
          team: { organizationId: 'org-session' },
        },
      }),
    );
  });

  it('ignores an organization and user posted by the caller', async () => {
    // The old signature was (organizationId, userId, options).
    const call = getUserProjectsQuery as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    await call('org-victim', 'user-victim');

    const where = mockProjects.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-session');
    expect(JSON.stringify(where)).not.toContain('victim');
  });

  it('refuses without a signed-in user', async () => {
    mockGetUserId.mockResolvedValue(null);

    await expect(getUserProjectsQuery()).rejects.toThrow('Unauthorized');
    expect(mockProjects).not.toHaveBeenCalled();
  });
});
