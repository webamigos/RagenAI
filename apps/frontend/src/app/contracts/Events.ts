import { type MessageDto } from './Message';

export type SseInitEvent = {
  type: 'init';
};

export type SseMessageEvent = {
  type: 'message';
  payload: MessageDto;
};
