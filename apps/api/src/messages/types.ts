import { z } from 'zod';
import {
  type Role,
  type Message as MessageModel,
} from '../generated/prisma/client.js';

/**
 * Ported from apps/web's src/features/messages/contracts/message.types.ts.
 * `Role`/`Message` imported from the shared generated Prisma client (both
 * apps generate from the same root prisma/schema.prisma) instead of
 * apps/web's webpack-aliased `@/generated/prisma/browser` — no
 * browser/server client split exists in apps/api. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */

export const MESSAGE_MAX_LENGTH = 10000;

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
      .min(3, {
        message: t
          ? t('prompt-min')
          : 'Prompt must be at least 3 characters long',
      })
      .max(MESSAGE_MAX_LENGTH, {
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
          imageData: z.string().optional(),
          documentData: z.string().optional(),
        }),
      )
      .optional(),
    approvedToolCalls: z.array(z.string()).optional(),
    deniedToolCalls: z.array(z.string()).optional(),
  });

export type CreateMessageDto = z.infer<ReturnType<typeof createMessageSchema>>;

export type MessageAttachment = {
  name: string;
  size: number;
  type: string;
  sourceUrl?: string;
  imageData?: string;
  documentData?: string;
};

export type MessageDto = {
  role: Role;
  content: MessageModel['content'];
  createdAt: string;
  id: MessageModel['id'];
  runId?: MessageModel['runId'];
  rate?: MessageModel['rate'];
  messageType?: MessageModel['messageType'];
  voiceDurationSeconds?: MessageModel['voiceDurationSeconds'];
  voicePlayed?: MessageModel['voicePlayed'];
  attachments?: MessageAttachment[];
  metadata?: MessageMetadata;
};

export type ApiMessageDto = {
  id: MessageModel['id'];
  content: MessageModel['content'];
  role: Role;
  createdAt: string;
  runId: string;
};

export type MessageDtoWithoutId = Omit<MessageDto, 'id'>;

export type StreamedMessageDto = {
  content: string;
  createdAt: string;
  runId: string;
  reasoningContent?: string;
  isReasoning?: boolean;
};

export type MessageMetadata = {
  reasoningContent?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | null;
  model?: string | null;
};

export type DbMessageDto = {
  id: MessageModel['id'];
  content: MessageModel['content'];
  role: MessageModel['role'];
  runId?: MessageModel['runId'];
  source?: MessageModel['source'];
  metadata?: MessageMetadata;
};

/**
 * Duplicated from apps/web's
 * src/features/documents/contracts/knowledge-analytics.types.ts (only the
 * two types getNegativeQaQuery needs) — see
 * docs/adrs/21-monorepo-and-api-decoupling.md. Keep in sync manually until
 * a real shared package exists.
 */
export type NegativeQaItem = {
  threadId: string;
  messageId: string;
  threadTitle: string | null;
  createdAt: string;
};

export type NegativeQaResult = {
  items: NegativeQaItem[];
  total: number;
};
