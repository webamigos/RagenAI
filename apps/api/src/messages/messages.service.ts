import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type Thread,
  type MessageContentType,
  type Message,
  Role,
  Source,
} from '../generated/prisma/client.js';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '../crypto/thread-encryption.js';
import { decryptMessageContents } from '../crypto/decrypt-messages.js';
import {
  handleCommandError,
  type OperationResult,
} from './operation-result.js';
import {
  type DbMessageDto,
  type MessageAttachment,
  type MessageDto,
  type MessageMetadata,
  type NegativeQaItem,
  type NegativeQaResult,
} from './types.js';

const NEGATIVE_QA_PAGE_SIZE = 10;

function sanitizeAttachments(
  raw: MessageAttachment[] | undefined,
): MessageAttachment[] | undefined {
  if (!raw || raw.length === 0) {
    return undefined;
  }

  const sanitized = raw
    .filter(
      (item): item is MessageAttachment =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.name === 'string' &&
        typeof item.type === 'string',
    )
    .map((item) => {
      const attachment: MessageAttachment = {
        name: item.name.slice(0, 500),
        size: typeof item.size === 'number' ? Math.max(0, item.size) : 0,
        type: item.type.slice(0, 100),
      };

      if (typeof item.sourceUrl === 'string' && item.sourceUrl.length > 0) {
        try {
          const url = new URL(item.sourceUrl);
          if (url.protocol === 'https:' || url.protocol === 'http:') {
            attachment.sourceUrl = url.toString();
          }
        } catch {
          // Invalid URL — omit sourceUrl
        }
      }

      if (typeof item.imageData === 'string' && item.imageData.length > 0) {
        attachment.imageData = item.imageData;
      }

      if (
        typeof item.documentData === 'string' &&
        item.documentData.length > 0
      ) {
        attachment.documentData = item.documentData;
      }

      return attachment;
    });

  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Ported from apps/web's src/features/messages/services/{commands,
 * queries}/*.ts. See docs/adrs/21-monorepo-and-api-decoupling.md — Phase
 * C, second slice.
 *
 * Not ported: send-message-command.ts (needs findOrCreateThreadCommand
 * from apps/web's `threads` feature, which Phase C defers to its own
 * later, most-auth-coupled slice — this orchestration wrapper moves there
 * instead). getOrgIdFromAuthOrThrow()/getOrgIdFromAuth() (apps/web's
 * session-cookie-based auth helpers) are replaced everywhere with an
 * explicit `orgId` parameter — same pattern as every other ported service
 * in apps/api; identity comes from the caller (a future guard/controller),
 * not from internal session derivation.
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async maybeEncryptContent(
    threadId: string,
    content: string,
  ): Promise<string> {
    if (!isEncryptionEnabled()) {
      return content;
    }

    const thread = await this.prisma.client.thread.findUniqueOrThrow({
      where: { id: threadId },
      select: { encryptedDek: true },
    });

    let dek: Buffer;

    if (thread.encryptedDek) {
      dek = await decryptThreadKey(thread.encryptedDek);
    } else {
      const key = await generateThreadKey();
      dek = key.plaintextDek;

      // Conditional update to avoid race condition: only set DEK if still null
      const result = await this.prisma.client.thread.updateMany({
        where: { id: threadId, encryptedDek: null },
        data: { encryptedDek: key.encryptedDek },
      });

      // Another request won the race — use their key instead
      if (result.count === 0) {
        const updated = await this.prisma.client.thread.findUniqueOrThrow({
          where: { id: threadId },
          select: { encryptedDek: true },
        });
        if (!updated.encryptedDek) {
          throw new Error('Failed to initialize thread encryption key');
        }
        dek = await decryptThreadKey(updated.encryptedDek);
      }
    }

    return encryptContent(content, dek);
  }

  /**
   * Fire-and-forget: mirrors apps/web's createVisitorEntry usage in
   * createAndStoreMessageCommand — errors are caught and logged, never
   * propagated, so a visitor-tracking failure can't break message
   * creation.
   */
  private async createVisitorEntry(
    message: Message,
    visitorId: string,
  ): Promise<void> {
    try {
      await this.prisma.client.visitorMessages.create({
        data: { messageId: message.id, visitorId },
      });
    } catch (error) {
      this.logger.error('Cannot create visitor entry', error);
    }
  }

  async createMessageInDb({
    threadId,
    message,
    role,
    visitorId,
    runId,
    messageType = 'TEXT',
    voiceDurationSeconds,
    attachments,
  }: {
    threadId: Thread['id'];
    message: Omit<DbMessageDto, 'id' | 'role'>;
    role: Role;
    visitorId?: string;
    runId?: string;
    messageType?: MessageContentType;
    voiceDurationSeconds?: number;
    attachments?: MessageAttachment[];
  }): Promise<Message> {
    const sanitizedAttachments = sanitizeAttachments(attachments);

    try {
      const encryptedContent = await this.maybeEncryptContent(
        threadId,
        message.content,
      );

      return await this.prisma.client.message.create({
        data: {
          threadId,
          content: encryptedContent,
          role,
          source: message.source ?? Source.UI,
          visitorId,
          runId,
          messageType,
          voiceDurationSeconds,
          attachments: sanitizedAttachments,
          metadata: message.metadata ? (message.metadata as object) : undefined,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create message in DB', error);
      throw error;
    }
  }

  async createAndStoreMessage({
    prompt,
    threadId,
    visitorId,
    messageType = 'TEXT',
    voiceDurationSeconds,
    attachments,
  }: {
    prompt: string;
    threadId: Thread['id'];
    visitorId?: string;
    messageType?: MessageContentType;
    voiceDurationSeconds?: number;
    attachments?: MessageAttachment[];
  }): Promise<MessageDto> {
    try {
      const trimmedPrompt = prompt.trim();

      const dbMessage = await this.createMessageInDb({
        threadId,
        message: { content: trimmedPrompt },
        role: Role.USER,
        visitorId,
        messageType,
        voiceDurationSeconds,
        attachments,
      });

      // Auto-set thread title from first user message if not already set
      try {
        await this.prisma.client.thread.updateMany({
          where: { id: threadId, title: null },
          data: {
            title:
              trimmedPrompt.length > 100
                ? `${trimmedPrompt.substring(0, 100)}...`
                : trimmedPrompt,
          },
        });
      } catch (titleError) {
        this.logger.error('Failed to auto-set thread title', titleError);
      }

      const savedAttachments = dbMessage.attachments as
        MessageAttachment[] | null;

      if (visitorId) {
        void this.createVisitorEntry(dbMessage, visitorId);
      }

      return {
        id: dbMessage.id,
        role: dbMessage.role,
        createdAt: dbMessage.createdAt.toISOString(),
        content: dbMessage.content,
        messageType: dbMessage.messageType,
        voiceDurationSeconds: dbMessage.voiceDurationSeconds,
        voicePlayed: dbMessage.voicePlayed,
        attachments: savedAttachments ?? undefined,
      };
    } catch (error) {
      this.logger.error('Failed to create and store message', error);
      throw error;
    }
  }

  async deleteMessage(
    messageId: string,
    orgId: string,
  ): Promise<OperationResult> {
    try {
      const message = await this.prisma.client.message.findFirst({
        where: {
          id: messageId,
          thread: { project: { organizationId: orgId } },
        },
        select: { id: true },
      });

      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      await this.prisma.client.message.delete({ where: { id: message.id } });

      return { success: true };
    } catch (error) {
      return handleCommandError(error, 'Failed to delete message');
    }
  }

  async rateMessage(
    messagePublicId: string,
    feedback: 'up' | 'down',
    orgId: string,
  ): Promise<OperationResult> {
    try {
      if (feedback !== 'up' && feedback !== 'down') {
        return { success: false, error: 'Invalid feedback' };
      }

      const message = await this.prisma.client.message.findFirst({
        where: { id: messagePublicId, thread: { organizationId: orgId } },
        select: { id: true },
      });

      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      await this.prisma.client.message.update({
        where: { id: message.id },
        data: { rate: feedback === 'up' ? 1 : 0 },
      });

      return { success: true };
    } catch (error) {
      return handleCommandError(error, 'Failed to rate message');
    }
  }

  async regenerateAssistantMessage(
    threadId: string,
    orgId: string,
    _userId: string,
  ): Promise<
    OperationResult<{ prompt: string; attachments: MessageAttachment[] }>
  > {
    try {
      const thread = await this.prisma.client.thread.findFirst({
        where: { id: threadId, organizationId: orgId },
        include: {
          messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });

      if (!thread) {
        return { success: false, error: 'Thread not found' };
      }

      const messages = thread.messages;

      const lastAssistantIdx = [...messages]
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.role === 'ASSISTANT')
        .at(-1)?.i;

      if (lastAssistantIdx === undefined) {
        return { success: false, error: 'No assistant message to regenerate' };
      }

      const lastUserIdx = [...messages]
        .map((m, i) => ({ m, i }))
        .filter(({ m, i }) => m.role === 'USER' && i < lastAssistantIdx)
        .at(-1)?.i;

      if (lastUserIdx === undefined) {
        return {
          success: false,
          error: 'No user message found before the last assistant message',
        };
      }

      const assistantMessage = messages[lastAssistantIdx];
      const userMessage = messages[lastUserIdx];

      await this.prisma.client.$transaction([
        this.prisma.client.message.delete({
          where: { id: assistantMessage.id },
        }),
        this.prisma.client.message.delete({ where: { id: userMessage.id } }),
      ]);

      this.logger.log('Regenerate: deleted assistant and user messages', {
        threadId,
        assistantMessageId: assistantMessage.id,
        userMessageId: userMessage.id,
      });

      return {
        success: true,
        data: {
          prompt: userMessage.content,
          attachments: Array.isArray(userMessage.attachments)
            ? (userMessage.attachments as unknown[]).filter(
                (a): a is MessageAttachment => {
                  if (typeof a !== 'object' || a === null) {
                    return false;
                  }
                  const r = a as Record<string, unknown>;
                  return (
                    typeof r.name === 'string' &&
                    typeof r.size === 'number' &&
                    typeof r.type === 'string' &&
                    (r.sourceUrl === undefined ||
                      typeof r.sourceUrl === 'string') &&
                    (r.imageData === undefined ||
                      typeof r.imageData === 'string') &&
                    (r.documentData === undefined ||
                      typeof r.documentData === 'string')
                  );
                },
              )
            : [],
        },
      };
    } catch (error) {
      return handleCommandError(
        error,
        'Failed to regenerate assistant message',
      );
    }
  }

  async updateMessagePlayed(
    messagePublicId: string,
    orgId: string,
  ): Promise<Message> {
    if (!orgId) {
      throw new Error('Unauthorized: organization context required');
    }

    try {
      const message = await this.prisma.client.message.findFirst({
        where: { id: messagePublicId, thread: { organizationId: orgId } },
        select: { id: true },
      });

      if (!message) {
        throw new Error('Message not found');
      }

      return await this.prisma.client.message.update({
        where: { id: message.id },
        data: { voicePlayed: true, messageType: 'VOICE' },
      });
    } catch (error) {
      this.logger.error('Failed to update message played status', error);
      throw error;
    }
  }

  async getThreadMessages(
    threadId: Thread['id'],
    visitorId: Thread['visitorId'],
  ) {
    try {
      const thread = await this.prisma.client.thread.findFirst({
        where: { id: threadId, visitorId },
        select: {
          id: true,
          encryptedDek: true,
          mentionedProjectId: true,
          project: { select: { id: true, title: true } },
        },
      });

      if (!thread) {
        return { messages: [], threadContext: null };
      }

      const rawMessages = await this.prisma.client.message.findMany({
        where: { threadId: thread.id },
        select: {
          id: true,
          createdAt: true,
          content: true,
          role: true,
          runId: true,
          rate: true,
          voiceDurationSeconds: true,
          messageType: true,
          voicePlayed: true,
          attachments: true,
          metadata: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      });

      let messages;
      try {
        messages = await decryptMessageContents(
          rawMessages,
          thread.encryptedDek,
        );
      } catch (error) {
        this.logger.error('Failed to decrypt thread messages', {
          err: error,
          threadId: thread.id,
        });
        messages = rawMessages;
      }

      let mentionedProject: { id: string; title: string } | null = null;
      if (thread.mentionedProjectId) {
        try {
          mentionedProject = await this.prisma.client.project.findUnique({
            where: { id: thread.mentionedProjectId },
            select: { id: true, title: true },
          });

          if (!mentionedProject) {
            this.logger.warn(
              'Mentioned project not found, will fallback to regular thread project',
              {
                threadId: thread.id,
                mentionedProjectId: thread.mentionedProjectId,
              },
            );
          }
        } catch (error) {
          this.logger.error(
            'Error fetching mentioned project, will fallback to regular thread project',
            {
              err: error,
              threadId: thread.id,
              mentionedProjectId: thread.mentionedProjectId,
            },
          );
        }
      }

      return {
        messages: messages.map((message) => ({
          ...message,
          createdAt: message.createdAt.toISOString(),
          attachments:
            (message.attachments as MessageAttachment[] | null) ?? undefined,
          metadata: (message.metadata as MessageMetadata | null) ?? undefined,
        })),
        threadContext: {
          project: thread.project,
          mentionedProject,
          mentionedProjectId: thread.mentionedProjectId,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch messages from DB', error);
      throw error;
    }
  }

  async getNegativeQa(
    orgId: string,
    days: number,
    page = 1,
  ): Promise<NegativeQaResult> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const skip = (page - 1) * NEGATIVE_QA_PAGE_SIZE;

    const where = {
      rate: 0,
      createdAt: { gte: since },
      thread: { organizationId: orgId },
    };

    const [messages, total] = await Promise.all([
      this.prisma.client.message.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          thread: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: NEGATIVE_QA_PAGE_SIZE,
      }),
      this.prisma.client.message.count({ where }),
    ]);

    const items: NegativeQaItem[] = messages
      .filter((m) => m.thread !== null)
      .map((m) => ({
        messageId: m.id,
        threadId: m.thread!.id,
        threadTitle: m.thread!.title ?? null,
        createdAt: m.createdAt.toISOString(),
      }));

    return { items, total };
  }
}
