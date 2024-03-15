import { z } from 'zod';
import { Role, Message as MessageModel } from '@prisma/client';

export const createMessageSchema = z.object({
  prompt: z.string().min(10, 'Provide what least 10 characters'),
});

export type CreateMessageDto = z.infer<typeof createMessageSchema>;

export type Message = {
  role: Role;
  content: MessageModel['content'];
  created_at: MessageModel['created_at'];
  public_id: MessageModel['public_id'];
};

export type MessageResponse = {
  message: Message;
};
