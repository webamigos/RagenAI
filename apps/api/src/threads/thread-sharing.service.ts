import { Injectable, Logger } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { decryptMessageContents } from '../crypto/decrypt-messages.js';
import {
  type PublicLinkDto,
  type PublicThreadResult,
  type ThreadShareInfo,
} from './thread-core.types.js';

type ShareThreadInput = {
  threadId: string;
  recipientUserIds: string[];
  organizationId: string;
  currentUserId: string;
};

type OperationResult = { success: true } | { success: false; error: string };

type CreatePublicLinkInput = {
  threadId: string;
  organizationId: string;
  currentUserId: string;
  expiresAt: Date | null;
  password?: string;
};

type RevokePublicLinkInput = {
  threadId: string;
  currentUserId: string;
  organizationId: string;
};

type GetPublicThreadInput = {
  publicId: string;
  submittedPassword?: string | null;
  cookieVerified?: boolean;
};

/**
 * Ported from ragen-app's src/features/threads/services/{commands,queries}/
 * {share-thread,create-public-link,revoke-public-link}-command.ts and
 * {get-thread-shares,get-public-thread,get-public-link,get-user-public-links}
 * -query.ts. See docs/adrs/21-monorepo-and-api-decoupling.md — Phase C,
 * sixth (last) slice.
 *
 * `sendNotificationToUser()` became `NotificationsService.create()` —
 * same exclusion as the rest of this codebase's ported notification calls:
 * the row is written, but the real-time SSE push (`publish()` to
 * ragen-app's Next.js-specific SSE bus) is not — see NotificationsModule's
 * own doc comment for the same gap.
 */
@Injectable()
export class ThreadSharingService {
  private readonly logger = new Logger(ThreadSharingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async shareThread(input: ShareThreadInput): Promise<OperationResult> {
    const { threadId, recipientUserIds, organizationId, currentUserId } = input;

    const thread = await this.prisma.client.thread.findFirst({
      where: { id: threadId, organizationId },
      select: { id: true, visitorId: true, title: true },
    });

    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }

    if (thread.visitorId !== currentUserId) {
      return { success: false, error: 'Only the thread creator can share it' };
    }

    const filteredRecipients = recipientUserIds.filter(
      (id) => id !== currentUserId,
    );

    const result = await this.prisma.client.$transaction(async (tx) => {
      if (filteredRecipients.length > 0) {
        const memberCount = await tx.member.count({
          where: {
            organizationId,
            userId: { in: filteredRecipients },
          },
        });

        if (memberCount !== filteredRecipients.length) {
          return {
            success: false as const,
            error: 'Some recipients are not members of this organization',
          };
        }
      }

      await tx.threadShare.deleteMany({
        where: { threadId: thread.id, userId: { notIn: filteredRecipients } },
      });

      if (filteredRecipients.length > 0) {
        const existing = await tx.threadShare.findMany({
          where: { threadId: thread.id },
          select: { userId: true },
        });
        const existingUserIds = new Set(existing.map((s) => s.userId));

        const newShares = filteredRecipients
          .filter((userId) => !existingUserIds.has(userId))
          .map((userId) => ({
            threadId: thread.id,
            userId,
            sharedByUserId: currentUserId,
          }));

        if (newShares.length > 0) {
          await tx.threadShare.createMany({ data: newShares });
        }
      }

      return { success: true as const };
    });

    if (result.success && filteredRecipients.length > 0) {
      await Promise.allSettled(
        filteredRecipients.map((recipientId) =>
          this.notifications.create({
            userId: recipientId,
            organizationId,
            type: 'THREAD_SHARED_NEW_MESSAGE',
            title: 'Nowa wiadomość w udostępnionym wątku',
            body: thread.title ?? undefined,
            resourceUrl: `/threads/${threadId}`,
          }),
        ),
      );
    }

    return result;
  }

  async getThreadShares(
    threadId: string,
    organizationId: string,
    currentUserId: string,
  ): Promise<ThreadShareInfo> {
    const thread = await this.prisma.client.thread.findFirst({
      where: { id: threadId, organizationId },
      select: { id: true },
    });

    if (!thread) {
      return { threadId: threadId, sharedWith: [] };
    }

    const members = await this.prisma.client.member.findMany({
      where: { organizationId, userId: { not: currentUserId } },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    const existingShares = await this.prisma.client.threadShare.findMany({
      where: { threadId: thread.id },
      select: { userId: true },
    });
    const sharedUserIds = new Set(existingShares.map((s) => s.userId));

    const sharedWith = members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      isShared: sharedUserIds.has(m.userId),
    }));

    return { threadId: threadId, sharedWith };
  }

  async createPublicLink(
    input: CreatePublicLinkInput,
  ): Promise<
    { success: true; publicId: string } | { success: false; error: string }
  > {
    const { threadId, organizationId, currentUserId, expiresAt, password } =
      input;

    const thread = await this.prisma.client.thread.findFirst({
      where: { id: threadId, organizationId },
      select: { id: true, visitorId: true },
    });

    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }

    if (thread.visitorId !== currentUserId) {
      return {
        success: false,
        error: 'Only the thread owner can create a public link',
      };
    }

    const existing = await this.prisma.client.threadPublicLink.findUnique({
      where: { threadId: thread.id },
    });

    if (existing) {
      return {
        success: false,
        error: 'Public link already exists. Revoke it first.',
      };
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const link = await this.prisma.client.threadPublicLink.create({
      data: {
        threadId: thread.id,
        createdByUserId: currentUserId,
        expiresAt,
        passwordHash,
      },
      select: { publicId: true },
    });

    return { success: true, publicId: link.publicId };
  }

  async revokePublicLink(
    input: RevokePublicLinkInput,
  ): Promise<OperationResult> {
    const { threadId, currentUserId, organizationId } = input;

    const link = await this.prisma.client.threadPublicLink.findUnique({
      where: { threadId },
      select: {
        id: true,
        createdByUserId: true,
        thread: { select: { organizationId: true } },
      },
    });

    if (!link) {
      return { success: false, error: 'Public link not found' };
    }

    if (link.thread.organizationId !== organizationId) {
      return { success: false, error: 'Access denied' };
    }

    if (link.createdByUserId !== currentUserId) {
      return { success: false, error: 'Only the link creator can revoke it' };
    }

    await this.prisma.client.threadPublicLink.delete({ where: { threadId } });

    return { success: true };
  }

  async getPublicLink(
    threadId: string,
    userId: string,
  ): Promise<PublicLinkDto | null> {
    const link = await this.prisma.client.threadPublicLink.findUnique({
      where: { threadId },
      select: {
        publicId: true,
        threadId: true,
        expiresAt: true,
        passwordHash: true,
        createdAt: true,
        createdByUserId: true,
        thread: { select: { title: true } },
      },
    });

    if (!link || link.createdByUserId !== userId) {
      return null;
    }

    return {
      publicId: link.publicId,
      threadId: link.threadId,
      threadTitle: link.thread.title,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      hasPassword: link.passwordHash !== null,
      createdAt: link.createdAt.toISOString(),
    };
  }

  async getUserPublicLinks(userId: string): Promise<PublicLinkDto[]> {
    const links = await this.prisma.client.threadPublicLink.findMany({
      where: { createdByUserId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        publicId: true,
        threadId: true,
        expiresAt: true,
        passwordHash: true,
        createdAt: true,
        thread: { select: { title: true } },
      },
    });

    return links.map((link) => ({
      publicId: link.publicId,
      threadId: link.threadId,
      threadTitle: link.thread.title,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      hasPassword: link.passwordHash !== null,
      createdAt: link.createdAt.toISOString(),
    }));
  }

  async getPublicThread(
    input: GetPublicThreadInput,
  ): Promise<PublicThreadResult> {
    const {
      publicId,
      submittedPassword = null,
      cookieVerified = false,
    } = input;

    const link = await this.prisma.client.threadPublicLink.findUnique({
      where: { publicId },
      select: {
        expiresAt: true,
        passwordHash: true,
        createdBy: { select: { name: true } },
        thread: {
          select: {
            title: true,
            encryptedDek: true,
            messages: {
              select: { role: true, content: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!link) {
      return { status: 'not_found' };
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      return { status: 'not_found' };
    }

    if (link.passwordHash) {
      if (cookieVerified) {
        // HMAC-signed cookie verified by caller — no need to re-check password
      } else if (!submittedPassword) {
        return { status: 'password_required' };
      } else {
        const valid = await bcrypt.compare(
          submittedPassword,
          link.passwordHash,
        );
        if (!valid) {
          return { status: 'password_invalid' };
        }
      }
    }

    const decryptedMessages = await decryptMessageContents(
      link.thread.messages,
      link.thread.encryptedDek,
    );

    return {
      status: 'ok',
      title: link.thread.title,
      messages: decryptedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      createdByName: link.createdBy.name,
    };
  }
}
