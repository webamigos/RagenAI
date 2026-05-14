import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProjectFindFirst = vi.fn();
const mockMemberFindFirst = vi.fn();
const mockTeamFindFirst = vi.fn();
const mockUpsert = vi.fn();
const mockSendNotification = vi.fn().mockResolvedValue(undefined);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/features/notifications/utils/send-notification-to-user', () => ({
  sendNotificationToUser: (...args: unknown[]) => mockSendNotification(...args),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    member: { findFirst: (...args: unknown[]) => mockMemberFindFirst(...args) },
    team: { findFirst: (...args: unknown[]) => mockTeamFindFirst(...args) },
    projectPermission: { upsert: (...args: unknown[]) => mockUpsert(...args) },
  },
}));

import { shareProjectCommand } from '../share-project-command';

const ORG_ID = 'org-1';
const PROJECT_ID = 'proj-1';
const GRANTER_ID = 'granter-1';

describe('shareProjectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when project not found in org', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    const result = await shareProjectCommand({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      granteeType: 'user',
      granteeId: 'user-2',
      permission: 'view',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({ success: false, error: 'Project not found' });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejects sharing back to the owner', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: PROJECT_ID,
      title: 'P',
      ownerId: 'owner-1',
    });

    const result = await shareProjectCommand({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      granteeType: 'user',
      granteeId: 'owner-1',
      permission: 'view',
      grantedBy: GRANTER_ID,
    });

    expect(result.success).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejects user grantee not in organization', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: PROJECT_ID,
      title: 'P',
      ownerId: 'owner-1',
    });
    mockMemberFindFirst.mockResolvedValue(null);

    const result = await shareProjectCommand({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      granteeType: 'user',
      granteeId: 'user-2',
      permission: 'view',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({
      success: false,
      error: 'User is not a member of this organization',
    });
  });

  it('rejects team grantee outside the org', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: PROJECT_ID,
      title: 'P',
      ownerId: 'owner-1',
    });
    mockTeamFindFirst.mockResolvedValue(null);

    const result = await shareProjectCommand({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      granteeType: 'team',
      granteeId: 'team-x',
      permission: 'full',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({
      success: false,
      error: 'Team not found in this organization',
    });
  });

  it('upserts permission and notifies user grantee', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: PROJECT_ID,
      title: 'My project',
      ownerId: 'owner-1',
    });
    mockMemberFindFirst.mockResolvedValue({ id: 'm-1' });
    mockUpsert.mockResolvedValue({ id: 1 });

    const result = await shareProjectCommand({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      granteeType: 'user',
      granteeId: 'user-2',
      permission: 'full',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({ success: true });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_granteeType_granteeId: {
            projectId: PROJECT_ID,
            granteeType: 'user',
            granteeId: 'user-2',
          },
        },
        update: { permission: 'full' },
      }),
    );
    expect(mockSendNotification).toHaveBeenCalledWith(
      'user-2',
      ORG_ID,
      'PROJECT_SHARED',
      expect.objectContaining({ body: 'My project' }),
    );
  });

  it('does not notify when sharing with a team', async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: PROJECT_ID,
      title: 'P',
      ownerId: 'owner-1',
    });
    mockTeamFindFirst.mockResolvedValue({ id: 'team-1' });
    mockUpsert.mockResolvedValue({ id: 2 });

    const result = await shareProjectCommand({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      granteeType: 'team',
      granteeId: 'team-1',
      permission: 'view',
      grantedBy: GRANTER_ID,
    });

    expect(result).toEqual({ success: true });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });
});
