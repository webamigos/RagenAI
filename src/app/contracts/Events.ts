import { type MessageDto } from './Message';

export type SseInitEvent = {
  type: 'init';
};

export type SseMessageEvent = {
  type: 'message';
  payload: MessageDto;
};

export type SseMessageDelta = {
  type: 'delta';
  payload: {
    content: string;
    run_id: string;
  };
};

export type SseMessageError = {
  type: 'error';
  message: string;
};
