import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Role, Source } from '../generated/prisma/client.js';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '@ragenai/crypto';
import {
  recordRetrievalUsage,
  type CitableSource,
} from '@ragenai/rag-core/retrieval-usage';

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
   *
   * `retrieved` is what the turn drew on. When given, the turn is recorded the
   * way the panel's is — `DocumentRetrieval` and `DocumentCitation` rows — so
   * an API thread opened in the panel shows its sources. A failure there is
   * logged and never costs the answer already saved.
   */
  saveAssistantMessage: (
    content: string,
    guardrailBlocked?: GuardrailBlockedMarker | null,
    retrieved?: readonly CitableSource[],
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

      const userContent = await this.maybeEncrypt(
        { threadId: thread.id, organizationId: orgId },
        fullUserContent,
      );

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
          retrieved?: readonly CitableSource[],
        ) => {
          let messageId: string;
          try {
            const encrypted = await this.maybeEncrypt(
              { threadId, organizationId: orgId },
              content,
            );
            const message = await this.prisma.client.message.create({
              select: { id: true },
              data: {
                threadId,
                content: encrypted,
                role: Role.ASSISTANT,
                source: Source.API,
                ...(guardrailBlocked ? { metadata: { guardrailBlocked } } : {}),
              },
            });
            messageId = message.id;
          } catch (err) {
            this.logger.error('Failed to save API assistant message', {
              err,
              threadId,
            });
            return;
          }
          if (retrieved && retrieved.length > 0) {
            await this.recordRetrieval({
              messageId,
              threadId,
              orgId,
              retrieved,
              answer: content,
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

  /**
   * The same rule as the panel's `recordKnowledgeUsageCommand`, which is
   * `recordRetrievalUsage` in rag-core: this binds it to this app's client and
   * to `maybeEncrypt`, so a snippet is protected exactly as the message beside
   * it (ADR-42). Never throws: a hole in the sources is the right failure for
   * an answer the caller already has.
   */
  private async recordRetrieval({
    messageId,
    threadId,
    orgId,
    retrieved,
    answer,
  }: {
    messageId: string;
    threadId: string;
    orgId: string;
    retrieved: readonly CitableSource[];
    answer: string;
  }): Promise<void> {
    try {
      await recordRetrievalUsage(retrieved, answer, {
        encryptSnippet: (snippet) =>
          this.maybeEncrypt({ threadId, organizationId: orgId }, snippet),
        onSnippetEncryptionFailed: (err) => {
          this.logger.warn(
            'Could not encrypt a source snippet — storing the retrieval without its quote',
            { err, threadId },
          );
        },
        writeUsage: async ({ retrievals, citedFileIds }) => {
          await this.prisma.client.$transaction([
            this.prisma.client.documentRetrieval.createMany({
              data: retrievals.map((row) => ({ ...row, messageId, orgId })),
              skipDuplicates: true,
            }),
            this.prisma.client.documentCitation.createMany({
              data: citedFileIds.map((fileId) => ({
                messageId,
                fileId,
                orgId,
              })),
              skipDuplicates: true,
            }),
          ]);
        },
      });
    } catch (err) {
      this.logger.warn('Failed to record API retrieval — non-blocking', {
        err,
        threadId,
      });
    }
  }

  /**
   * Reads and keys the thread within `organizationId`, the organization the
   * thread was just created in — a thread outside it is not found.
   */
  private async maybeEncrypt(
    { threadId, organizationId }: { threadId: string; organizationId: string },
    content: string,
  ): Promise<string> {
    if (!isEncryptionEnabled()) {
      return content;
    }

    // Check if the thread already has an encryption key
    const existing = await this.prisma.client.thread.findFirstOrThrow({
      where: { id: threadId, organizationId },
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
        where: { id: threadId, organizationId, encryptedDek: null },
        data: { encryptedDek: key.encryptedDek },
      });

      // Another request won the race — use their key
      if (result.count === 0) {
        const updated = await this.prisma.client.thread.findFirstOrThrow({
          where: { id: threadId, organizationId },
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
