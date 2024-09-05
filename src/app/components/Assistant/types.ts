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

export enum reducerActions {
  SET_INITIAL_LOAD,
  SET_MESSAGE_LOADING,
  SET_MESSAGE_ID,
  SET_LIMIT_LOCK,
  SET_LOADING_TEXT,
  SET_MESSAGE_ERROR,
  SET_STREAMED_MESSAGE,
  APPEND_TO_STREAMED_MESSAGE,
  SET_MESSAGES,
  ADD_MESSAGE,
}
const {
  SET_INITIAL_LOAD,
  SET_MESSAGE_LOADING,
  SET_MESSAGE_ID,
  SET_LIMIT_LOCK,
  SET_LOADING_TEXT,
  SET_MESSAGE_ERROR,
  SET_STREAMED_MESSAGE,
  APPEND_TO_STREAMED_MESSAGE,
  SET_MESSAGES,
  ADD_MESSAGE,
} = reducerActions;

export type Action =
  | { type: typeof SET_INITIAL_LOAD; payload: boolean }
  | { type: typeof SET_MESSAGE_LOADING; payload: boolean }
  | { type: typeof SET_MESSAGE_ID; payload: string }
  | { type: typeof SET_LIMIT_LOCK; payload: boolean }
  | { type: typeof SET_LOADING_TEXT; payload: string }
  | { type: typeof SET_MESSAGE_ERROR; payload: boolean }
  | {
      type: typeof SET_STREAMED_MESSAGE;
      payload: StreamedMessage | null;
    }
  | { type: typeof APPEND_TO_STREAMED_MESSAGE; payload: string }
  | { type: typeof SET_MESSAGES; payload: MessageDto[] }
  | { type: typeof ADD_MESSAGE; payload: MessageDto };
