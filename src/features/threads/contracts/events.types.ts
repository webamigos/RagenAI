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
  id: Thread['publicId'];
};

export type ApiSseMessageCreated = {
  id: Message['publicId'];
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

export type SseEndEvent = {
  type: 'end';
};
