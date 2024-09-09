import { z } from 'zod';
import { Role, Message as MessageModel } from '@prisma/client';

export const createMessageSchema = z.object({
  prompt: z.string().min(10, 'Provide what least 10 characters'),
});

export type CreateMessageDto = z.infer<typeof createMessageSchema>;

export type MessageDto = {
  role: Role;
  content: MessageModel['content'];
  created_at: MessageModel['created_at'];
  public_id: MessageModel['public_id'];
};

export type Thread = {
  thread: ThreadHistoryResponse[];
};

export type MessageDtoWithoutPublicId = Omit<MessageDto, 'public_id'>;

export type ThreadHistoryResponse = {
  created_at: Date;
  public_id: string;
  messages: MessageDtoWithoutPublicId[];
};
