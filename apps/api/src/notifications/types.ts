import { type NotificationType } from '../generated/prisma/client.js';

/**
 * Ported from ragen-app's
 * src/features/notifications/contracts/notification.types.ts. `NotificationType`
 * is imported directly from the shared generated Prisma client (both apps
 * generate from the same root prisma/schema.prisma — see
 * docs/adrs/21-monorepo-and-api-decoupling.md's schema-unification update)
 * rather than hand-duplicated like AiUsageStep was in an earlier slice.
 */
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
