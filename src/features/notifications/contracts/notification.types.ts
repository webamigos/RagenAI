import type { NotificationType } from '@/generated/prisma/client';

export type { NotificationType };

export type NotificationDto = {
  publicId: string;
  type: NotificationType;
  isRead: boolean;
  title: string;
  body: string | null;
  resourceUrl: string | null;
  createdAt: Date;
};

export type CreateNotificationInput = {
  userId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  body?: string;
  resourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type GetNotificationsInput = {
  userId: string;
  organizationId: string;
  isRead?: boolean;
  type?: NotificationType;
  cursor?: string;
  limit?: number;
};

export type GetNotificationsResult = {
  items: NotificationDto[];
  nextCursor: string | null;
};
