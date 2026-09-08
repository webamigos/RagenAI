import db from '@ragenai/prisma-client';
import { Role, Source } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '@ragenai/crypto';

/**
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
export async function createApiThread({
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
}) {
  let thread: { id: string } | null = null;

  try {
    const fullUserContent = chatHistory
      ? `${chatHistory}\n\nUSER: ${question.trim()}`
      : question.trim();

    const title =
      question.trim().length > 100
        ? `${question.trim().substring(0, 100)}...`
        : question.trim();

    thread = await db.thread.create({
      data: {
        organizationId: orgId,
        userId,
        visitorId: userId,
        projectId,
        source: Source.API,
        title: title || null,
      },
    });

    const userContent = await maybeEncrypt(thread.id, fullUserContent);

    await db.message.create({
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
      /**
       * Call after the full assistant response is collected to persist it.
       * Fire-and-forget safe — errors are logged, never thrown.
       */
      saveAssistantMessage: async (content: string) => {
        try {
          const encrypted = await maybeEncrypt(threadId, content);
          await db.message.create({
            data: {
              threadId,
              content: encrypted,
              role: Role.ASSISTANT,
              source: Source.API,
            },
          });
        } catch (err) {
          logger.error(
            { err, threadId },
            'Failed to save API assistant message',
          );
        }
      },
    };
  } catch (err) {
    logger.error(
      { err, threadId: thread?.id },
      'Failed to create API debug thread, continuing without persistence',
    );
    // Clean up orphan thread if it was created but message insert failed
    if (thread) {
      await db.thread
        .delete({ where: { id: thread.id } })
        .catch((cleanupErr) => {
          logger.error(
            { err: cleanupErr, threadId: thread!.id },
            'Failed to clean up orphan API debug thread',
          );
        });
    }
    return null;
  }
}

async function maybeEncrypt(
  threadId: string,
  content: string,
): Promise<string> {
  if (!isEncryptionEnabled()) {
    return content;
  }

  // Check if the thread already has an encryption key
  const existing = await db.thread.findUniqueOrThrow({
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
    const result = await db.thread.updateMany({
      where: { id: threadId, encryptedDek: null },
      data: { encryptedDek: key.encryptedDek },
    });

    // Another request won the race — use their key
    if (result.count === 0) {
      const updated = await db.thread.findUniqueOrThrow({
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
