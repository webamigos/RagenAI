// Internal domain logic — not a server action. See
// create-chatbot-command.ts for the rationale.
import db from '@ragenai/prisma-client';

export const deleteChatbotCommand = async (
  id: string,
  organizationId: string,
) => {
  return db.chatbot.deleteMany({
    where: { id, organizationId },
  });
};
