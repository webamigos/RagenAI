import { Message, Thread } from '@prisma/client';
import { ApiMessageDto, type MessageDto } from './Message';
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

export type ApiSseThreadFound = {
  id: Thread['public_id'];
};

export type ApiSseMessageCreated = {
  id: Message['public_id'];
};

export type SseMessageError = {
  type: 'error';
  message: string;
  originalErrorMessage?: string;
  code: ChainErrorCode;
};

export type SseEndEvent = {
  type: 'end';
};
