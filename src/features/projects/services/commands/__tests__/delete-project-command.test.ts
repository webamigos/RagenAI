import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAiUsageUpdate = vi.fn().mockResolvedValue({ count: 0 });
const mockThreadDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockUserDocumentDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockUserFileDelete = vi.fn().mockResolvedValue({ count: 0 });
const mockProjectDelete = vi.fn().mockResolvedValue({});
const mockTransaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
  return cb({
    aiUsage: { updateMany: mockAiUsageUpdate },
    thread: { deleteMany: mockThreadDelete },
    userDocument: { deleteMany: mockUserDocumentDelete },
    userFile: { deleteMany: mockUserFileDelete },
    project: { delete: mockProjectDelete },
  });
});
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
    $transaction: (...args: unknown[]) =>
      (mockTransaction as unknown as (...a: unknown[]) => unknown)(...args),
  },
}));

import { deleteProjectCommand } from '../delete-project-command';

describe('deleteProjectCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires owner-level access and cascades related rows', async () => {
    const result = await deleteProjectCommand('proj-1');

    expect(result).toEqual({ success: true });
    expect(mockRequireAccess).toHaveBeenCalledWith('proj-1', 'owner');
    expect(mockAiUsageUpdate).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
      data: { projectId: null },
    });
    expect(mockThreadDelete).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
    });
    expect(mockUserDocumentDelete).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
    });
    expect(mockUserFileDelete).toHaveBeenCalledWith({
      where: { projectId: 'proj-1' },
    });
    expect(mockProjectDelete).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
    });
  });
});
