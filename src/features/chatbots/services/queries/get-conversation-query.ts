'use server';

import db from '@ragenai/prisma-client';

export const getOrCreateConversationQuery = async (
  chatbotId: string,
  sessionId: string,
) => {
  const existing = await db.chatbotConversation.findFirst({
    where: { chatbotId, sessionId },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return db.chatbotConversation.create({
    data: { chatbotId, sessionId },
    select: { id: true },
  });
};

export const getConversationMessagesQuery = async (
  conversationId: string,
  limit = 10,
) => {
  return db.chatbotMessage.findMany({
    where: { conversationId },
    select: { role: true, content: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
};

export const getConversationsBySessionIdsQuery = async (
  chatbotId: string,
  sessionIds: string[],
) => {
  return db.chatbotConversation.findMany({
    where: { chatbotId, sessionId: { in: sessionIds } },
    select: {
      sessionId: true,
      createdAt: true,
      messages: {
        select: { content: true, role: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};
