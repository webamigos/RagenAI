import type { MessageDto } from '../../contracts/Message';

type StreamedMessage = {
  content: string;
  created_at: string;
};

export type State = {
  isInitialLoad: boolean;
  isMessageLoading: boolean;
  userMessageId: string;
  isLimitLock: boolean;
  messageLoadingText: string;
  isMessageError: boolean;
  streamedMessage: StreamedMessage | null;
  messages: MessageDto[];
};

export const reducerActions = {
  SET_INITIAL_LOAD: 'SET_INITIAL_LOAD',
  SET_MESSAGE_LOADING: 'SET_MESSAGE_LOADING',
  SET_MESSAGE_ID: 'SET_MESSAGE_ID',
  SET_LIMIT_LOCK: 'SET_LIMIT_LOCK',
  SET_LOADING_TEXT: 'SET_LOADING_TEXT',
  SET_MESSAGE_ERROR: 'SET_MESSAGE_ERROR',
  SET_STREAMED_MESSAGE: 'SET_STREAMED_MESSAGE',
  APPEND_TO_STREAMED_MESSAGE: 'APPEND_TO_STREAMED_MESSAGE',
  SET_MESSAGES: 'SET_MESSAGES',
  ADD_MESSAGE: 'ADD_MESSAGE',
} as const;

export type Action =
  | { type: typeof reducerActions.SET_INITIAL_LOAD; payload: boolean }
  | { type: typeof reducerActions.SET_MESSAGE_LOADING; payload: boolean }
  | { type: typeof reducerActions.SET_MESSAGE_ID; payload: string }
  | { type: typeof reducerActions.SET_LIMIT_LOCK; payload: boolean }
  | { type: typeof reducerActions.SET_LOADING_TEXT; payload: string }
  | { type: typeof reducerActions.SET_MESSAGE_ERROR; payload: boolean }
  | {
      type: typeof reducerActions.SET_STREAMED_MESSAGE;
      payload: StreamedMessage | null;
    }
  | { type: typeof reducerActions.APPEND_TO_STREAMED_MESSAGE; payload: string }
  | { type: typeof reducerActions.SET_MESSAGES; payload: MessageDto[] }
  | { type: typeof reducerActions.ADD_MESSAGE; payload: MessageDto };
