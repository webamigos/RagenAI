import type { NotificationType } from '@/generated/prisma/client';

export type { NotificationType };

export type NotificationDto = {
  publicId: string;
  type: NotificationType;
  isRead: boolean;
  title: string;
  body: string | null;
  resourceUrl: string | null;
  /**
   * The structured details the text is rendered from — read it with
   * `parseNotificationDetails` from `@ragenai/platform-contracts`. Absent or
   * `null` on rows written before that contract, whose `title`/`body` are
   * then shown as stored.
   */
  metadata?: unknown;
  createdAt: Date;
};

export type CreateNotificationInput = {
  userId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  body?: string;
  resourceUrl?: string;
  /** The type's details, built with `notificationDetails()`. */
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
