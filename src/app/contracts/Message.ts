import { z } from 'zod';
import { Role, Message as MessageModel } from '@prisma/client';

export enum ChatType {
  CONVERSATION = 'conversation',
  RAG = 'rag',
}

export enum ChatResponseType {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
}

export const createMessageSchema = z.object({
  prompt: z.string().min(10, 'Provide what least 10 characters'),
  mode: z.enum([ChatType.CONVERSATION, ChatType.RAG]).optional(),
  useKnowledge: z.boolean().optional(),
  messageType: z.enum(['TEXT', 'VOICE']).optional(),
  voiceDurationSeconds: z.number().optional(),
});

export type CreateMessageDto = z.infer<typeof createMessageSchema>;

export type MessageDto = {
  role: Role;
  content: MessageModel['content'];
  created_at: MessageModel['created_at'];
  public_id: MessageModel['public_id'];
  run_id?: MessageModel['run_id'];
  rate?: MessageModel['rate'];
  message_type?: MessageModel['message_type'];
  voice_duration_seconds?: MessageModel['voice_duration_seconds'];
  voice_played?: MessageModel['voice_played'];
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
