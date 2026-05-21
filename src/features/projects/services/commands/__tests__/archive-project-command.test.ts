import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
const mockRequireAccess = vi.fn().mockResolvedValue({
  orgId: 'org-1',
  userId: 'user-1',
});

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../utils/require-project-access', () => ({
  requireProjectAccess: (...args: unknown[]) => mockRequireAccess(...args),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: { update: (...args: unknown[]) => mockUpdate(...args) },
  },
}));

import { archiveProjectCommand } from '../archive-project-command';

describe('archiveProjectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
  });

  it('archives and stamps archivedAt', async () => {
    const result = await archiveProjectCommand('proj-1', true);

    expect(result).toEqual({ success: true });
    expect(mockRequireAccess).toHaveBeenCalledWith('proj-1', 'manage');
    const call = mockUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'proj-1' });
    expect(call.data.isArchived).toBe(true);
    expect(call.data.archivedAt).toBeInstanceOf(Date);
  });

  it('unarchives and clears archivedAt', async () => {
    await archiveProjectCommand('proj-1', false);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { isArchived: false, archivedAt: null },
    });
  });
});
