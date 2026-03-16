import { z } from 'zod';
import {
  type Role,
  type Message as MessageModel,
} from '@/generated/prisma/browser';

export enum ChatType {
  CONVERSATION = 'conversation',
  RAG = 'rag',
}

export enum ChatResponseType {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
}

export const createMessageSchema = (t?: (key: string) => string) =>
  z.object({
    prompt: z
      .string()
      .min(10, {
        message: t
          ? t('prompt-min')
          : 'Prompt must be at least 10 characters long',
      })
      .max(10000, {
        message: t
          ? t('prompt-max')
          : 'Prompt must be at most 10000 characters long',
      }),
    mode: z.enum(['conversation', 'rag']).optional(),
    useKnowledge: z.boolean().optional(),
    messageType: z.enum(['TEXT', 'VOICE']).optional(),
    voiceDurationSeconds: z.number().optional(),
    threadDocuments: z
      .array(
        z.object({
          name: z.string(),
          content: z.string(),
          size: z.number(),
          type: z.string(),
          userFileId: z.string().optional(),
          sourceUrl: z.string().optional(),
        }),
      )
      .optional(),
  });

export type CreateMessageDto = z.infer<ReturnType<typeof createMessageSchema>>;

export type MessageAttachment = {
  name: string;
  size: number;
  type: string;
  sourceUrl?: string;
};

export type MessageDto = {
  role: Role;
  content: MessageModel['content'];
  createdAt: string;
  publicId: MessageModel['publicId'];
  runId?: MessageModel['runId'];
  rate?: MessageModel['rate'];
  messageType?: MessageModel['messageType'];
  voiceDurationSeconds?: MessageModel['voiceDurationSeconds'];
  voicePlayed?: MessageModel['voicePlayed'];
  attachments?: MessageAttachment[];
};

export type ApiMessageDto = {
  id: MessageModel['publicId'];
  content: MessageModel['content'];
  role: Role;
  createdAt: string;
  runId: string; // TODO: to remove
};

export type MessageDtoWithoutPublicId = Omit<MessageDto, 'publicId'>;

export type StreamedMessageDto = {
  content: string;
  createdAt: string;
  runId: string;
  reasoningContent?: string;
  isReasoning?: boolean;
};

export type DbMessageDto = {
  id: MessageModel['id'];
  content: MessageModel['content'];
  role: MessageModel['role'];
  runId?: MessageModel['runId'];
  source?: MessageModel['source'];
};
