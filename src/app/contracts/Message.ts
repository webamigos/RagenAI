import { z } from 'zod';
import { Role, Message as MessageModel } from '@/generated/prisma/browser';

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
        })
      )
      .optional(),
  });

export type CreateMessageDto = z.infer<ReturnType<typeof createMessageSchema>>;

export type MessageDto = {
  role: Role;
  content: MessageModel['content'];
  created_at: string;
  public_id: MessageModel['public_id'];
  run_id?: MessageModel['run_id'];
  rate?: MessageModel['rate'];
  message_type?: MessageModel['message_type'];
  voice_duration_seconds?: MessageModel['voice_duration_seconds'];
  voice_played?: MessageModel['voice_played'];
};

export type ApiMessageDto = {
  id: MessageModel['public_id'];
  content: MessageModel['content'];
  role: Role;
  created_at: string;
  run_id: string; // TODO: to remove
};

export type Thread = {
  thread: ThreadHistoryResponse[];
};

export type MessageDtoWithoutPublicId = Omit<MessageDto, 'public_id'>;

export type ThreadHistoryResponse = {
  created_at: string;
  public_id: string;
  messages: MessageDtoWithoutPublicId[];
  project_id?: number | null;
  preferred_model?: string | null;
};

export type StreamedMessageDto = {
  content: string;
  created_at: string;
  runId: string;
};

export type ProjectContext = {
  id: number;
  public_id: string;
  title: string;
};

export type ThreadContext = {
  project: ProjectContext | null;
  mentionedProject: ProjectContext | null;
  mentionedProjectId: number | null;
};

export type MessagesWithContext = {
  messages: MessageDto[];
  threadContext: ThreadContext | null;
};
