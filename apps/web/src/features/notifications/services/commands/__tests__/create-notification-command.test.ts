import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NotificationType } from '@/generated/prisma/client';

const mockCreate = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    notification: { create: mockCreate },
  },
}));

const { createNotificationCommand } =
  await import('../create-notification-command');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createNotificationCommand', () => {
  it('creates notification with correct fields', async () => {
    mockCreate.mockResolvedValue({
      publicId: 'pub-1',
      type: 'DOCUMENT_SHARED' as NotificationType,
      isRead: false,
      title: 'Test',
      body: null,
      resourceUrl: null,
      createdAt: new Date('2026-01-01'),
    });

    const result = await createNotificationCommand({
      userId: 'user-1',
      organizationId: 'org-1',
      type: 'DOCUMENT_SHARED',
      title: 'Test',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        type: 'DOCUMENT_SHARED',
        title: 'Test',
      }),
      select: expect.any(Object),
    });

    expect(result.publicId).toBe('pub-1');
    expect(result.isRead).toBe(false);
  });
});
