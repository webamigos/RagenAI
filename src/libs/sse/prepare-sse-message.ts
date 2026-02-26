import {
  type SseEndEvent,
  type SseInitEvent,
  type SseMessageDelta,
  type SseMessageError,
  type SseMessageEvent,
  type ApiSseMessageEvent,
  type ApiSseMessageDelta,
  type ApiSseReasoningDelta,
  type ApiSseThreadFound,
  type ApiSseMessageCreated,
} from '@/features/threads/contracts/events.types';

export const prepareSseMessage = (
  event: string,
  data:
    | SseInitEvent
    | SseMessageEvent
    | SseMessageDelta
    | SseMessageError
    | SseEndEvent,
): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

export type ApiEvent =
  | 'init'
  | 'delta'
  | 'reasoning_delta'
  | 'reasoning_start'
  | 'reasoning_end'
  | 'find_thread'
  | 'thread_found'
  | 'save_user_message'
  | 'user_message_saved'
  | 'user_message_created'
  | 'init_lmm'
  | 'get_thread_messages'
  | 'add_thread_messages_to_lmm'
  | 'start_lmm'
  | 'llm_completed'
  | 'save_assistant_response'
  | 'assistant_response_saved'
  | 'final_response'
  | 'error'
  | 'close';

export type ApiEventData =
  | ApiSseMessageEvent
  | ApiSseMessageDelta
  | ApiSseReasoningDelta
  | ApiSseThreadFound
  | ApiSseMessageCreated;

export const prepareApiSseMessage = (
  event: ApiEvent,
  data?: ApiEventData | SseMessageError,
) => {
  return `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
};

export const parseSseString = (sseString: string) => {
  const lines = sseString.split('\n').filter((line) => line.trim() !== '');
  let event: string | undefined;
  let data: string | undefined;

  for (const line of lines) {
    const [key, ...values] = line.split(': ');
    const value = values.join(': ');

    if (key === 'event') {
      event = value;
    } else if (key === 'data') {
      data = value;
    }
  }

  if (!event) {
    throw new Error('No event found in SSE message');
  }

  return {
    event: event as ApiEvent,
    data: data ? JSON.parse(data) : undefined,
  };
};

const encoder = new TextEncoder();

export const sendApiEvent = (
  controller: ReadableStreamDefaultController,
  event: ApiEvent,
  data?: ApiEventData | SseMessageError,
) => {
  controller.enqueue(encoder.encode(prepareApiSseMessage(event, data)));
};
