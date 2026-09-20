import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, Source } from '../generated/prisma/client.js';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '@ragenai/crypto';

/**
 * Why an assistant message holds a refusal instead of an answer.
 *
 * Written only when an `OUTPUT` guardrail stopped the turn. The panel renders
 * a localized sentence off this rather than off the stored content, which is
 * English — neither this API nor `/api/threads` has a locale to translate
 * with, and a thread created through the API is read in the panel like any
 * other.
 *
 * Spelled as apps/web spells it, because the panel reads both.
 */
export type GuardrailBlockedMarker = {
  guardrail: string;
  rule: string;
};

export type CreateApiThreadResult = {
  threadId: string;
  /**
   * Call after the full assistant response is collected to persist it.
   * Fire-and-forget safe — errors are logged, never thrown.
   *
   * `guardrailBlocked` marks a stored refusal. It is a second argument rather
   * than something inferred from the content, because "this text happens to
   * equal the refusal sentence" is not the same claim as "a rule refused this
   * answer" — and the panel renders on the marker.
   */
  saveAssistantMessage: (
    content: string,
    guardrailBlocked?: GuardrailBlockedMarker | null,
  ) => Promise<void>;
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
    /** Null for a knowledge-base turn; `Thread.projectId` is nullable. */
    projectId: string | null;
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
        saveAssistantMessage: async (
          content: string,
          guardrailBlocked?: GuardrailBlockedMarker | null,
        ) => {
          try {
            const encrypted = await this.maybeEncrypt(threadId, content);
            await this.prisma.client.message.create({
              data: {
                threadId,
                content: encrypted,
                role: Role.ASSISTANT,
                source: Source.API,
                ...(guardrailBlocked ? { metadata: { guardrailBlocked } } : {}),
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
