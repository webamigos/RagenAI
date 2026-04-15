'use server';

import db from '@ragenai/prisma-client';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';
import { logger } from '@/app/lib/utils/logger';

export const getChatbotThreadMessagesQuery = async (
  threadId: string,
  organizationId: string,
) => {
  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId, chatbotId: { not: null } },
    select: {
      id: true,
      visitorId: true,
      createdAt: true,
      encryptedDek: true,
      messages: {
        select: { id: true, createdAt: true, content: true, role: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!thread) {
    return null;
  }

  const threadDto = {
    id: thread.id,
    visitorId: thread.visitorId,
    createdAt: thread.createdAt.toISOString(),
  };

  let messages: typeof thread.messages;
  try {
    messages = await decryptMessageContents(
      thread.messages,
      thread.encryptedDek,
    );
  } catch (error) {
    // We can't distinguish "empty thread" from "decrypt failed" to the
    // admin unless we surface it, so flag the state rather than hiding
    // it behind an empty array.
    logger.error(
      { err: error, threadId },
      'Failed to decrypt chatbot thread messages',
    );
    return { thread: threadDto, messages: [], decryptionFailed: true };
  }

  return {
    thread: threadDto,
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    decryptionFailed: false,
  };
};
