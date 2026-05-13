'use server';

import db from '@ragenai/prisma-client';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';
import { logger } from '@/app/lib/utils/logger';

export const getChatbotSessionMessagesQuery = async (
  chatbotId: string,
  sessionId: string,
): Promise<{ role: string; content: string }[]> => {
  const thread = await db.thread.findFirst({
    where: { chatbotId, visitorId: sessionId },
    select: {
      id: true,
      encryptedDek: true,
      messages: {
        select: { id: true, createdAt: true, role: true, content: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });

  if (!thread) {
    return [];
  }

  const reversed = [...thread.messages].reverse();

  let decrypted: typeof reversed;
  try {
    decrypted = await decryptMessageContents(reversed, thread.encryptedDek);
  } catch (err) {
    logger.error(
      { err, threadId: thread.id },
      'Failed to decrypt chatbot session messages for widget history',
    );
    return reversed.map(({ role, content }) => ({ role, content }));
  }

  return decrypted.map(({ role, content }) => ({ role, content }));
};

export const getChatbotSessionListQuery = async (
  chatbotId: string,
  sessionIds: string[],
): Promise<
  { sessionId: string; createdAt: string; firstMessage: string | null }[]
> => {
  const threads = await db.thread.findMany({
    where: { chatbotId, visitorId: { in: sessionIds } },
    select: {
      id: true,
      visitorId: true,
      createdAt: true,
      encryptedDek: true,
      messages: {
        select: { content: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const results = await Promise.all(
    threads.map(async (t) => {
      const rawMessages = t.messages;
      let firstMessage: string | null = rawMessages[0]?.content ?? null;

      if (firstMessage !== null && t.encryptedDek) {
        try {
          const decrypted = await decryptMessageContents(
            rawMessages,
            t.encryptedDek,
          );
          firstMessage = decrypted[0]?.content ?? null;
        } catch (err) {
          logger.error(
            { err, threadId: t.id },
            'Failed to decrypt chatbot session list preview message',
          );
        }
      }

      return {
        sessionId: t.visitorId ?? '',
        createdAt: t.createdAt.toISOString(),
        firstMessage,
      };
    }),
  );

  return results;
};
