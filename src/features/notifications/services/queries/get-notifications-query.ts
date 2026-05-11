import db from '@ragenai/prisma-client';
import type {
  GetNotificationsInput,
  GetNotificationsResult,
  NotificationDto,
} from '../../contracts/notification.types';
import type { NotificationType } from '@/generated/prisma/client';

const SELECT = {
  publicId: true,
  type: true,
  isRead: true,
  title: true,
  body: true,
  resourceUrl: true,
  createdAt: true,
} as const;

export async function getNotificationsQuery(
  input: GetNotificationsInput,
): Promise<GetNotificationsResult> {
  const limit = input.limit ?? 20;
  const take = limit + 1;

  const where: {
    userId: string;
    organizationId: string;
    isRead?: boolean;
    type?: NotificationType;
    createdAt?: { lt: Date };
  } = {
    userId: input.userId,
    organizationId: input.organizationId,
  };

  if (input.isRead !== undefined) {
    where.isRead = input.isRead;
  }

  if (input.type) {
    where.type = input.type;
  }

  if (input.cursor) {
    const pivot = await db.notification.findFirst({
      where: {
        publicId: input.cursor,
        userId: input.userId,
        organizationId: input.organizationId,
      },
      select: { createdAt: true },
    });
    if (pivot) {
      where.createdAt = { lt: pivot.createdAt };
    }
  }

  const rows = await db.notification.findMany({
    where,
    select: SELECT,
    orderBy: { createdAt: 'desc' },
    take,
  });

  const hasMore = rows.length > limit;
  const items: NotificationDto[] = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? (items[items.length - 1]?.publicId ?? null)
    : null;

  return { items, nextCursor };
}
