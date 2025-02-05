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
): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

type ApiEvent = 'init' | 'delta' | 'message' | 'end';

export const prepareApiSseMessage = (
  event: ApiEvent,
  data?: ApiSseMessageEvent | ApiSseMessageDelta
) => {
  return `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
};
