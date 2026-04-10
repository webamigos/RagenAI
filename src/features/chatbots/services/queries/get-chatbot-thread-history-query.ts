'use server';

import db from '@ragenai/prisma-client';
import { decryptMessageContents } from '@/libs/crypto/decrypt-messages';
import { logger } from '@/app/lib/utils/logger';

export const getChatbotThreadHistoryQuery = async (
  threadId: string,
  take = 10,
): Promise<{ role: string; content: string }[]> => {
  const [threadMeta, rawMessages] = await Promise.all([
    db.thread.findFirst({
      where: { id: threadId },
      select: { encryptedDek: true },
    }),
    db.message.findMany({
      where: { threadId },
      select: { role: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take,
    }),
  ]);

  if (!threadMeta?.encryptedDek) {
    return rawMessages.reverse();
  }

  try {
    const decrypted = await decryptMessageContents(
      rawMessages,
      threadMeta.encryptedDek,
    );
    return decrypted.reverse();
  } catch (err) {
    logger.error({ err, threadId }, 'Failed to decrypt chatbot history');
    return [];
  }
};
