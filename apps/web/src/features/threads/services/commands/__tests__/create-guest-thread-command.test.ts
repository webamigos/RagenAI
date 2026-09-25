import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, mockProjectFindFirst, mockPublicProject } = vi.hoisted(
  () => ({
    mockCreate: vi.fn(),
    mockProjectFindFirst: vi.fn(),
    mockPublicProject: vi.fn(),
  }),
);

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    thread: { create: mockCreate },
    project: { findFirst: mockProjectFindFirst },
  },
}));
vi.mock('@/app/lib/services/cookies', () => ({
  getVisitorIdFromCookie: vi.fn().mockResolvedValue('visitor-1'),
}));
vi.mock('@/features/projects/services/queries/get-project-query', () => ({
  getPublicProjectQuery: mockPublicProject,
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createGuestThreadCommand } from '../create-guest-thread-command';

const dataOf = () =>
  mockCreate.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ id: 'thread-1' });
  mockProjectFindFirst.mockReset().mockResolvedValue(null);
  mockPublicProject.mockReset().mockResolvedValue({
    organizationId: 'org-public',
    projectId: 'project-public',
    title: 'Public assistant',
  });
});

describe('createGuestThreadCommand and the tenant scope', () => {
  // Anyone can call this Server Action, signed in or not. Whatever org or
  // project it is posted must not reach the row.
  it('takes the organization and the project from the access token', async () => {
    const result = await createGuestThreadCommand({ accessToken: 'tok' });

    expect(mockPublicProject).toHaveBeenCalledWith('tok');
    expect(dataOf()).toMatchObject({
      organizationId: 'org-public',
      projectId: 'project-public',
      visitorId: 'visitor-1',
    });
    expect(result).toEqual({
      success: true,
      thread: { id: 'thread-1', projectId: 'project-public' },
    });
  });

  it('ignores an organization and project posted by the caller', async () => {
    // The old input carried `organizationId` and `projectId`.
    await createGuestThreadCommand({
      accessToken: 'tok',
      organizationId: 'org-victim',
      projectId: 'project-victim',
    } as Parameters<typeof createGuestThreadCommand>[0]);

    expect(dataOf().organizationId).toBe('org-public');
    expect(dataOf().projectId).toBe('project-public');
  });

  it('creates nothing for an unknown or unpublished access token', async () => {
    mockPublicProject.mockResolvedValue(null);

    await expect(
      createGuestThreadCommand({ accessToken: 'stale' }),
    ).resolves.toEqual({
      success: false,
      errorMessage: 'Cannot create thread',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('keeps a mentioned project only when it is in the same organization', async () => {
    mockProjectFindFirst.mockResolvedValue({ id: 'project-same-org' });

    await createGuestThreadCommand({
      accessToken: 'tok',
      mentionedProjectId: 'project-same-org',
    });

    expect(mockProjectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-same-org', organizationId: 'org-public' },
      }),
    );
    expect(dataOf().mentionedProjectId).toBe('project-same-org');
  });

  it('drops a mentioned project from another organization', async () => {
    mockProjectFindFirst.mockResolvedValue(null);

    await createGuestThreadCommand({
      accessToken: 'tok',
      mentionedProjectId: 'project-other-org',
    });

    expect(dataOf().mentionedProjectId).toBeNull();
  });

  it('without an access token, writes no organization and mentions nothing', async () => {
    await createGuestThreadCommand({ mentionedProjectId: 'project-any' });

    expect(mockProjectFindFirst).not.toHaveBeenCalled();
    expect(dataOf()).toMatchObject({
      organizationId: null,
      projectId: null,
      mentionedProjectId: null,
    });
  });
});
