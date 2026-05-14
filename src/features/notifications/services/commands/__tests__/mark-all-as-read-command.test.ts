import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateMany = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    notification: { updateMany: mockUpdateMany },
  },
}));

const { markAllAsReadCommand } = await import('../mark-all-as-read-command');

beforeEach(() => vi.clearAllMocks());

describe('markAllAsReadCommand', () => {
  it('scopes update to userId and organizationId', async () => {
    mockUpdateMany.mockResolvedValue({ count: 5 });

    await markAllAsReadCommand({ userId: 'user-1', organizationId: 'org-1' });

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', organizationId: 'org-1', isRead: false },
      data: { isRead: true },
    });
  });
});
