import {
  SseEndEvent,
  SseInitEvent,
  SseMessageDelta,
  SseMessageError,
  SseMessageEvent,
  ApiSseMessageEvent,
  ApiSseMessageDelta,
} from '@/app/contracts/Events';

export const prepareSseMessage = (
  event: string,
  data:
    | SseInitEvent
    | SseMessageEvent
    | SseMessageDelta
    | SseMessageError
    | SseEndEvent
    | ApiSseMessageEvent
    | ApiSseMessageDelta
): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};
