import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Prisma } from '../generated/prisma/client.js';
import {
  type CreateNotificationInput,
  type NotificationDto,
  type GetNotificationsInput,
  type GetNotificationsResult,
  type NotificationType,
} from './types.js';

const SELECT = {
  publicId: true,
  type: true,
  isRead: true,
  title: true,
  body: true,
  resourceUrl: true,
  metadata: true,
  createdAt: true,
} as const;

/**
 * Ported from apps/web's src/features/notifications/services/{commands,
 * queries}/*.ts (create-notification-command, mark-all-as-read-command,
 * mark-as-read-command, get-notifications-query). See
 * docs/adrs/21-monorepo-and-api-decoupling.md — Phase C, first slice.
 *
 * Not ported: send-notification-to-user.ts (the real-time SSE push layer
 * on top of createNotificationCommand, via apps/web's
 * src/app/lib/services/notifications/sse-bus — Next.js-specific delivery
 * mechanism, no equivalent exists in apps/api yet) and the three
 * src/app/api/notifications/{push,stream,user-push}/route.ts endpoints
 * (Pusher/SSE delivery, not CRUD — out of scope for this service-only
 * slice per the user's direction).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The display name of a member of `organizationId`, for a notification's
   * "{name} shared …" sentence. Read through the membership, so a user id
   * from another organization yields nothing. Never throws and never blocks
   * the share it decorates: a failed read returns `undefined` and the
   * sentence is rendered without a name.
   */
  async memberDisplayName(
    userId: string,
    organizationId: string,
  ): Promise<string | undefined> {
    try {
      const member = await this.prisma.client.member.findFirst({
        where: { userId, organizationId },
        select: { user: { select: { name: true } } },
      });
      const name = member?.user.name?.trim();
      return name ? name : undefined;
    } catch (err: unknown) {
      this.logger.warn(
        `Could not read a sharer's name for a notification (organizationId=${organizationId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  async create(input: CreateNotificationInput): Promise<NotificationDto> {
    return this.prisma.client.notification.create({
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

  async markAllAsRead({
    userId,
    organizationId,
  }: {
    userId: string;
    organizationId: string;
  }): Promise<void> {
    await this.prisma.client.notification.updateMany({
      where: { userId, organizationId, isRead: false },
      data: { isRead: true },
    });
  }

  async markAsRead({
    publicId,
    userId,
    organizationId,
  }: {
    publicId: string;
    userId: string;
    organizationId: string;
  }): Promise<void> {
    await this.prisma.client.notification.updateMany({
      where: { publicId, userId, organizationId },
      data: { isRead: true },
    });
  }

  async getNotifications(
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
      const pivot = await this.prisma.client.notification.findFirst({
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

    const rows = await this.prisma.client.notification.findMany({
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
}
