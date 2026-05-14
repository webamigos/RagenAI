import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    notification: { updateMany: mockUpdateMany },
  },
}));

const { markAsReadCommand } = await import('../mark-as-read-command');

beforeEach(() => vi.clearAllMocks());

describe('markAsReadCommand', () => {
  it('scopes update to userId and organizationId to prevent IDOR', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await markAsReadCommand({
      publicId: 'pub-1',
      userId: 'user-1',
      organizationId: 'org-1',
    });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { publicId: 'pub-1', userId: 'user-1', organizationId: 'org-1' },
      data: { isRead: true },
    });
  });

  it('does not throw when notification not found (count = 0)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      markAsReadCommand({
        publicId: 'pub-999',
        userId: 'user-1',
        organizationId: 'org-1',
      }),
    ).resolves.not.toThrow();
  });
});
