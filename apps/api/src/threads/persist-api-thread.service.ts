import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, Source } from '../generated/prisma/client.js';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '../crypto/thread-encryption.js';

export type CreateApiThreadResult = {
  threadId: string;
  /**
   * Call after the full assistant response is collected to persist it.
   * Fire-and-forget safe — errors are logged, never thrown.
   */
  saveAssistantMessage: (content: string) => Promise<void>;
};

/**
 * Ported from apps/web's src/app/api/v1/persist-api-thread.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Create a Thread + user Message for an API request, then return a
 * helper to persist the assistant's reply once the stream finishes.
 *
 * Thread is created with `source: API` so it shows up in the project
 * view's "API threads" tab. Title is auto-set from the user's question.
 *
 * Fail-open: if message creation fails the orphan thread is cleaned up
 * and the function returns null so the caller can proceed without
 * blocking the API response.
 */
@Injectable()
export class PersistApiThreadService {
  private readonly logger = new Logger(PersistApiThreadService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createApiThread({
    orgId,
    userId,
    projectId,
    question,
    chatHistory,
  }: {
    orgId: string;
    userId: string;
    projectId: string;
    question: string;
    chatHistory?: string;
  }): Promise<CreateApiThreadResult | null> {
    let thread: { id: string } | null = null;

    try {
      const fullUserContent = chatHistory
        ? `${chatHistory}\n\nUSER: ${question.trim()}`
        : question.trim();

      const title =
        question.trim().length > 100
          ? `${question.trim().substring(0, 100)}...`
          : question.trim();

      thread = await this.prisma.client.thread.create({
        data: {
          organizationId: orgId,
          userId,
          visitorId: userId,
          projectId,
          source: Source.API,
          title: title || null,
        },
      });

      const userContent = await this.maybeEncrypt(thread.id, fullUserContent);

      await this.prisma.client.message.create({
        data: {
          threadId: thread.id,
          content: userContent,
          role: Role.USER,
          source: Source.API,
          visitorId: userId,
        },
      });

      const threadId = thread.id;

      return {
        threadId,
        saveAssistantMessage: async (content: string) => {
          try {
            const encrypted = await this.maybeEncrypt(threadId, content);
            await this.prisma.client.message.create({
              data: {
                threadId,
                content: encrypted,
                role: Role.ASSISTANT,
                source: Source.API,
              },
            });
          } catch (err) {
            this.logger.error('Failed to save API assistant message', {
              err,
              threadId,
            });
          }
        },
      };
    } catch (err) {
      this.logger.error(
        'Failed to create API debug thread, continuing without persistence',
        { err, threadId: thread?.id },
      );
      // Clean up orphan thread if it was created but message insert failed
      if (thread) {
        const orphanId = thread.id;
        await this.prisma.client.thread
          .delete({ where: { id: orphanId } })
          .catch((cleanupErr: unknown) => {
            this.logger.error('Failed to clean up orphan API debug thread', {
              err: cleanupErr,
              threadId: orphanId,
            });
          });
      }
      return null;
    }
  }

  private async maybeEncrypt(
    threadId: string,
    content: string,
  ): Promise<string> {
    if (!isEncryptionEnabled()) {
      return content;
    }

    // Check if the thread already has an encryption key
    const existing = await this.prisma.client.thread.findUniqueOrThrow({
      where: { id: threadId },
      select: { encryptedDek: true },
    });

    let dek: Buffer;

    if (existing.encryptedDek) {
      dek = await decryptThreadKey(existing.encryptedDek);
    } else {
      const key = await generateThreadKey();
      dek = key.plaintextDek;

      // Conditional update to avoid race condition
      const result = await this.prisma.client.thread.updateMany({
        where: { id: threadId, encryptedDek: null },
        data: { encryptedDek: key.encryptedDek },
      });

      // Another request won the race — use their key
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
}
