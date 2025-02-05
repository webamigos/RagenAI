import { z } from 'zod';
import { Role, Message as MessageModel } from '@prisma/client';

export enum ChatType {
  CONVERSATION = 'conversation',
  RAG = 'rag',
}

export const createMessageSchema = z.object({
  prompt: z.string().min(10, 'Provide what least 10 characters'),
  mode: z.enum([ChatType.CONVERSATION, ChatType.RAG]).optional(),
  useKnowledge: z.boolean().optional(),
});

export type CreateMessageDto = z.infer<typeof createMessageSchema>;

export type MessageDto = {
  role: Role;
  content: MessageModel['content'];
  created_at: MessageModel['created_at'];
  public_id: MessageModel['public_id'];
  run_id?: MessageModel['run_id'];
  rate?: MessageModel['rate'];
};

export type ApiMessageDto = {
  id: MessageModel['public_id'];
  content: MessageModel['content'];
  role: Role;
  created_at: string;
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

export type StreamedMessageDto = {
  content: string;
  created_at: string;
  runId: string;
};
