'use server';

import db from '@ragenai/prisma-client';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';
import { logger } from '@/app/lib/utils/logger';

export const getChatbotThreadsQuery = async (
  chatbotId: string,
  organizationId: string,
  skip = 0,
  take = 20,
) => {
  const where = { chatbotId, organizationId };

  const [threads, total] = await Promise.all([
    db.thread.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: take + 1,
      select: {
        id: true,
        visitorId: true,
        createdAt: true,
        title: true,
        encryptedDek: true,
        _count: { select: { messages: true } },
        messages: {
          select: { content: true, role: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    }),
    db.thread.count({ where }),
  ]);

  const hasMore = threads.length > take;
  const threadsSlice = hasMore ? threads.slice(0, take) : threads;

  const decryptedThreads = await Promise.all(
    threadsSlice.map(async (t) => {
      let messages = t.messages;

      if (messages.length > 0 && t.encryptedDek) {
        try {
          messages = await decryptMessageContents(messages, t.encryptedDek);
        } catch (err) {
          logger.error(
            { err, threadId: t.id },
            'Failed to decrypt chatbot thread preview message',
          );
        }
      }

      const { encryptedDek: _encryptedDek, ...rest } = t;

      return {
        ...rest,
        createdAt: t.createdAt.toISOString(),
        messages,
      };
    }),
  );

  return {
    threads: decryptedThreads,
    hasMore,
    total,
  };
};
