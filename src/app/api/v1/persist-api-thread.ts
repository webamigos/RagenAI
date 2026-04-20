import db from '@ragenai/prisma-client';
import { Role, Source } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
} from '@/libs/crypto/thread-encryption';

/**
 * Create a Thread + user Message for an API request, then return a
 * helper to persist the assistant's reply once the stream finishes.
 *
 * Thread is created with `source: API` so it shows up in the project
 * view's "API threads" tab. Title is auto-set from the user's question.
 */
export async function createApiThread({
  orgId,
  userId,
  projectId,
  question,
}: {
  orgId: string;
  userId: string;
  projectId: string;
  question: string;
}) {
  const title =
    question.trim().length > 100
      ? `${question.trim().substring(0, 100)}...`
      : question.trim();

  const thread = await db.thread.create({
    data: {
      organizationId: orgId,
      userId,
      visitorId: userId,
      projectId,
      source: Source.API,
      title: title || null,
    },
  });

  const userContent = await maybeEncrypt(thread.id, question.trim());

  await db.message.create({
    data: {
      threadId: thread.id,
      content: userContent,
      role: Role.USER,
      source: Source.API,
      visitorId: userId,
    },
  });

  return {
    threadId: thread.id,
    /**
     * Call after the full assistant response is collected to persist it.
     * Fire-and-forget safe — errors are logged, never thrown.
     */
    saveAssistantMessage: async (content: string) => {
      try {
        const encrypted = await maybeEncrypt(thread.id, content);
        await db.message.create({
          data: {
            threadId: thread.id,
            content: encrypted,
            role: Role.ASSISTANT,
            source: Source.API,
          },
        });
      } catch (err) {
        logger.error(
          { err, threadId: thread.id },
          'Failed to save API assistant message',
        );
      }
    },
  };
}

async function maybeEncrypt(
  threadId: string,
  content: string,
): Promise<string> {
  if (!isEncryptionEnabled()) {
    return content;
  }

  const key = await generateThreadKey();

  await db.thread.updateMany({
    where: { id: threadId, encryptedDek: null },
    data: { encryptedDek: key.encryptedDek },
  });

  return encryptContent(content, key.plaintextDek);
}
