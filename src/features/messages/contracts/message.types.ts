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

import { MESSAGE_MAX_LENGTH } from '@/features/messages/constants/limits';
export { MESSAGE_MAX_LENGTH };

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
    /**
     * Phase 2b — tool-call approval flow. When the user clicks Approve
     * on a paused tool-confirmation card, the client resubmits the chat
     * with this field populated. The server threads it into the chain's
     * `experimental_context` so the MCP `needsApproval` predicate lets
     * the matching tool call through instead of pausing again.
     *
     * Scoped per-turn: only honored for tool calls in the turn being
     * resubmitted. Expired/stale IDs are harmless because the predicate
     * only compares them against the live `toolCallId` the SDK generates.
     */
    approvedToolCalls: z.array(z.string()).optional(),
    /**
     * Phase 2b — explicit denial audit trail. When the user clicks Deny
     * on a paused tool-confirmation card, the client sets this field so
     * the server can record a `TOOL_CALL_DENIED` security event. No
     * server-side behavior other than the audit trail — the natural
     * language denial in the prompt tells the LLM to stand down.
     */
    deniedToolCalls: z.array(z.string()).optional(),
  });

export type CreateMessageDto = z.infer<ReturnType<typeof createMessageSchema>>;

export type MessageAttachment = {
  name: string;
  size: number;
  type: string;
  sourceUrl?: string;
  imageData?: string; // base64 data URL for image attachments
  documentData?: string; // base64 data URL for binary documents (PDF, EPUB)
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
  runId: string; // TODO: to remove
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
  /** Accumulated `reasoning_content` from a "Deep thinking" turn. */
  reasoningContent?: string;
  /** The `reasoning_effort` used for this turn (low/medium/high). */
  reasoningEffort?: 'low' | 'medium' | 'high' | null;
  /** The model that produced this message (post-rewrite — what actually ran). */
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
