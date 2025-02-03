import {
  SseEndEvent,
  SseInitEvent,
  SseMessageDelta,
  SseMessageError,
  SseMessageEvent,
} from '@/app/contracts/Events';

export const prepareSseMessage = (
  event: string,
  data:
    | SseInitEvent
    | SseMessageEvent
    | SseMessageDelta
    | SseMessageError
    | SseEndEvent
): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};
