import { ApiMessageDto, type MessageDto } from './Message';
import type { ChainErrorCode } from '@/libs/chains/types/errors';

export type SseInitEvent = {
  type: 'init';
};

export type SseMessageEvent = {
  type: 'message';
  payload: MessageDto;
};

export type ApiSseMessageEvent = {
  type: 'message';
  payload: ApiMessageDto;
};

export type SseMessageDelta = {
  type: 'delta';
  payload: {
    content: string;
    runId: string;
  };
};

export type ApiSseMessageDelta = {
  type: 'delta';
  payload: {
    content: string;
  };
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
