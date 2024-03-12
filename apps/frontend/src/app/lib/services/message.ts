import { Thread, Message, Role } from '@prisma/client';
import db from '@salesyy/prisma-client';

type MessageDto = {
  id: Message['id'];
  created_at: Message['openai_created_at'];
  content: Message['content'];
};

export const createMessage = async ({
  thread,
  message,
  role,
}: {
  thread: Thread;
  message: MessageDto;
  role: Role;
}) => {
  // TODO: moderation
  await db.message.create({
    data: {
      thread_id: thread.id,
      openai_message_id: message.id,
      openai_created_at: message.created_at,
      content: message.content,
      role,
    },
  });
};
