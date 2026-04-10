'use server';

import db from '@ragenai/prisma-client';
import { Source } from '@/generated/prisma/client';

export const getOrCreateChatbotThreadCommand = async (
  chatbotId: string,
  organizationId: string,
  sessionId: string,
) => {
  const existing = await db.thread.findFirst({
    where: { chatbotId, visitorId: sessionId },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return db.thread.create({
    data: {
      chatbotId,
      organizationId,
      visitorId: sessionId,
      source: Source.PUBLIC,
    },
    select: { id: true },
  });
};
