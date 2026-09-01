'use server';

import db from '@ragenai/prisma-client';
import { Prisma, Source } from '@/generated/prisma/client';

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

  try {
    return await db.thread.create({
      data: {
        chatbotId,
        organizationId,
        visitorId: sessionId,
        source: Source.CHATBOT,
      },
      select: { id: true },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return db.thread.findFirstOrThrow({
        where: { chatbotId, visitorId: sessionId },
        select: { id: true },
      });
    }
    throw err;
  }
};
