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

import { starProjectCommand } from '../star-project-command';

describe('starProjectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
  });

  it('sets isStarred true', async () => {
    const result = await starProjectCommand('proj-1', true);

    expect(result).toEqual({ success: true });
    expect(mockRequireAccess).toHaveBeenCalledWith('proj-1', 'manage');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { isStarred: true },
    });
  });

  it('sets isStarred false', async () => {
    await starProjectCommand('proj-1', false);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { isStarred: false },
    });
  });
});
