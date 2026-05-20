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

import { renameProjectCommand } from '../rename-project-command';

describe('renameProjectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an empty title', async () => {
    const result = await renameProjectCommand('proj-1', '   ');
    expect(result).toEqual({ success: false, error: 'Title is required' });
    expect(mockRequireAccess).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects an overly long title', async () => {
    const result = await renameProjectCommand('proj-1', 'x'.repeat(200));
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('trims and updates the project', async () => {
    mockUpdate.mockResolvedValue({});

    const result = await renameProjectCommand('proj-1', '  New name  ');

    expect(result).toEqual({ success: true });
    expect(mockRequireAccess).toHaveBeenCalledWith('proj-1', 'manage');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { title: 'New name' },
    });
  });
});
