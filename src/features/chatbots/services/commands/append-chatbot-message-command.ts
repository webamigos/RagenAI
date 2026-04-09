'use server';

import db from '@ragenai/prisma-client';
import { type Role } from '@/generated/prisma/client';

export const appendChatbotMessageCommand = async (
  conversationId: string,
  role: Role,
  content: string,
  sources?: unknown,
) => {
  return db.chatbotMessage.create({
    data: {
      conversationId,
      role,
      content,
      sources: sources ?? undefined,
    },
    select: { id: true },
  });
};
