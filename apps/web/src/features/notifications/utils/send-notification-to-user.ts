import { createNotificationCommand } from '../services/commands/create-notification-command';
import { publish } from '@/app/lib/services/notifications/sse-bus';
import { NOTIFICATION_EVENT } from '@/app/lib/services/notifications/types';
import type { NotificationType } from '@/generated/prisma/client';

export async function sendNotificationToUser(
  userId: string,
  organizationId: string,
  type: NotificationType,
  payload: {
    title: string;
    body?: string;
    resourceUrl?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const notification = await createNotificationCommand({
    userId,
    organizationId,
    type,
    ...payload,
  });

  publish({ userId, organizationId }, NOTIFICATION_EVENT, notification);
}
