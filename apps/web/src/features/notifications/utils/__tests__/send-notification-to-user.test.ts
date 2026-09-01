import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateNotificationCommand = vi.hoisted(() => vi.fn());
const mockPublish = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { notification: { create: vi.fn() } },
}));

vi.mock(
  '@/features/notifications/services/commands/create-notification-command',
  () => ({ createNotificationCommand: mockCreateNotificationCommand }),
);

vi.mock('@/app/lib/services/notifications/sse-bus', () => ({
  publish: mockPublish,
}));

vi.mock('@/app/lib/services/notifications/types', () => ({
  NOTIFICATION_EVENT: 'notification',
}));

import { sendNotificationToUser } from '../send-notification-to-user';

const mockNotification = {
  publicId: 'pub-1',
  type: 'DOCUMENT_SHARED' as const,
  isRead: false,
  title: 'Test doc',
  body: null,
  resourceUrl: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateNotificationCommand.mockResolvedValue(mockNotification);
});

describe('sendNotificationToUser', () => {
  it('calls createNotificationCommand with userId, organizationId, type and payload', async () => {
    await sendNotificationToUser('user-1', 'org-1', 'DOCUMENT_SHARED', {
      title: 'Test doc',
      body: 'body text',
      resourceUrl: '/docs/1',
    });

    expect(mockCreateNotificationCommand).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationId: 'org-1',
      type: 'DOCUMENT_SHARED',
      title: 'Test doc',
      body: 'body text',
      resourceUrl: '/docs/1',
    });
  });

  it('publishes the returned notification over SSE with correct target', async () => {
    await sendNotificationToUser('user-1', 'org-1', 'DOCUMENT_SHARED', {
      title: 'Test doc',
    });

    expect(mockPublish).toHaveBeenCalledWith(
      { userId: 'user-1', organizationId: 'org-1' },
      'notification',
      mockNotification,
    );
  });

  it('propagates errors thrown by createNotificationCommand', async () => {
    mockCreateNotificationCommand.mockRejectedValue(new Error('DB failure'));

    await expect(
      sendNotificationToUser('user-1', 'org-1', 'DOCUMENT_SHARED', {
        title: 'Test',
      }),
    ).rejects.toThrow('DB failure');

    expect(mockPublish).not.toHaveBeenCalled();
  });
});
