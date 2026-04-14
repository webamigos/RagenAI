'use server';

import db from '@ragenai/prisma-client';

export const deleteChatbotCommand = async (
  id: string,
  organizationId: string,
) => {
  return db.chatbot.deleteMany({
    where: { id, organizationId },
  });
};
