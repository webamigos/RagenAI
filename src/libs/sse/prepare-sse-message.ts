import {
  SseEndEvent,
  SseInitEvent,
  SseMessageDelta,
  SseMessageError,
  SseMessageEvent,
  ApiSseMessageEvent,
  ApiSseMessageDelta,
  ApiSseThreadFound,
  ApiSseMessageCreated,
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

type ApiEvent =
  | 'init'
  | 'delta'
  | 'find_thread'
  | 'thread_found'
  | 'save_user_message'
  | 'user_message_saved'
  | 'init_lmm'
  | 'get_thread_messages'
  | 'add_thread_messages_to_lmm'
  | 'start_lmm'
  | 'start_lmm'
  | 'llm_completed'
  | 'save_assistant_response'
  | 'assistant_response_saved'
  | 'final_response'
  | 'close';

type ApiEventData =
  | ApiSseMessageEvent
  | ApiSseMessageDelta
  | ApiSseThreadFound
  | ApiSseMessageCreated;

export const prepareApiSseMessage = (event: ApiEvent, data?: ApiEventData) => {
  return `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
};

const encoder = new TextEncoder();

export const sendApiEvent = (
  controller: ReadableStreamDefaultController,
  event: ApiEvent,
  data?: ApiEventData
) => {
  controller.enqueue(encoder.encode(prepareApiSseMessage(event, data)));
};
