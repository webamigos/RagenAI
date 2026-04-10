'use server';

import db from '@ragenai/prisma-client';

export const getChatbotSessionMessagesQuery = async (
  chatbotId: string,
  sessionId: string,
): Promise<{ role: string; content: string }[]> => {
  const thread = await db.thread.findFirst({
    where: { chatbotId, visitorId: sessionId },
    select: { id: true },
  });

  if (!thread) {
    return [];
  }

  const messages = await db.message.findMany({
    where: { threadId: thread.id },
    select: { role: true, content: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return messages.reverse();
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
      visitorId: true,
      createdAt: true,
      messages: {
        select: { content: true, role: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return threads.map((t) => ({
    sessionId: t.visitorId ?? '',
    createdAt: t.createdAt.toISOString(),
    firstMessage: t.messages[0]?.content ?? null,
  }));
};
