import { type Message, type Thread } from '@/generated/prisma/browser';
import {
  type ApiMessageDto,
  type MessageDto,
} from '@/features/messages/contracts/message.types';
import type { ChainErrorCode } from '@/libs/chains/types/errors';

export type SseInitEvent = {
  type: 'init';
};

export type SseMessageEvent = {
  type: 'message';
  payload: MessageDto;
};

export type ApiSseMessageEvent = ApiMessageDto;

export type SseMessageDelta = {
  type: 'delta';
  payload: {
    content: string;
  };
};

export type ApiSseMessageDelta = {
  content: string;
};

export type ApiSseReasoningDelta = {
  content: string;
};

export type ApiSseThreadFound = {
  id: Thread['id'];
};

export type ApiSseMessageCreated = {
  id: Message['id'];
};

export type SseMessageError = {
  type: 'error';
  message: string;
  originalErrorMessage?: string;
  code: ChainErrorCode;
};

export type ApiSseToolCall = {
  toolCallId: string;
  toolName: string;
};

export type ApiSseToolResult = {
  toolCallId: string;
  toolName: string;
};

/**
 * Emitted when the AI SDK pauses a write tool because its `needsApproval`
 * predicate returned true — Phase 2 prompt-injection gating. The client
 * currently renders a plain inline message ("this action requires
 * confirmation"); Phase 2b will upgrade this to a modal approval card.
 */
export type ApiSseToolApprovalRequest = {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  provider: string;
};

export type SseEndEvent = {
  type: 'end';
};
