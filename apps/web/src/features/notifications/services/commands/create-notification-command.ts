import db from '@ragenai/prisma-client';
import { type Prisma } from '@/generated/prisma/client';
import type {
  CreateNotificationInput,
  NotificationDto,
} from '../../contracts/notification.types';

const SELECT = {
  publicId: true,
  type: true,
  isRead: true,
  title: true,
  body: true,
  resourceUrl: true,
  createdAt: true,
} as const;

export async function createNotificationCommand(
  input: CreateNotificationInput,
): Promise<NotificationDto> {
  return db.notification.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      resourceUrl: input.resourceUrl ?? null,
      metadata: input.metadata
        ? (input.metadata as Prisma.InputJsonValue)
        : undefined,
    },
    select: SELECT,
  });
}
