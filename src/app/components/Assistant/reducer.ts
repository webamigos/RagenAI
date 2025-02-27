import {
  ChatResponseType,
  ChatType,
  MessageDto,
  StreamedMessageDto,
} from '@/app/contracts/Message';

export type State = {
  mode: ChatType;
  isInitialLoad: boolean;
  isMessageLoading: boolean;
  userMessageId: string;
  isLimitLock: boolean;
  messageLoadingText: string;
  isMessageError: boolean;
  streamedMessage: StreamedMessageDto | null;
  messages: MessageDto[];
  isError: boolean;
  responseType: ChatResponseType;
};

// used also in publicAssistantReducer
export enum sharedReducerActions {
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
  SET_IS_ERROR,
  REMOVE_MESSAGE,
}

export enum reducerActions {
  SET_MODE = 'SET_MODE',
  SET_MODE_VOICE = 'SET_MODE_VOICE',
  SET_MESSAGE_PLAYED = 'SET_MESSAGE_PLAYED',
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
  SET_IS_ERROR,
  REMOVE_MESSAGE,
} = sharedReducerActions;

const { SET_MODE, SET_MODE_VOICE, SET_MESSAGE_PLAYED } = reducerActions;

export type Action =
  | { type: typeof SET_INITIAL_LOAD; payload: boolean }
  | { type: typeof SET_MESSAGE_LOADING; payload: boolean }
  | { type: typeof SET_MESSAGE_ID; payload: string }
  | { type: typeof SET_LIMIT_LOCK; payload: boolean }
  | { type: typeof SET_LOADING_TEXT; payload: string }
  | { type: typeof SET_MESSAGE_ERROR; payload: boolean }
  | {
      type: typeof SET_STREAMED_MESSAGE;
      payload: StreamedMessageDto | null;
    }
  | {
      type: typeof APPEND_TO_STREAMED_MESSAGE;
      payload: { content: string; run_id: string };
    }
  | { type: typeof SET_MESSAGES; payload: MessageDto[] }
  | { type: typeof ADD_MESSAGE; payload: MessageDto }
  | { type: typeof SET_IS_ERROR; payload: boolean }
  | { type: typeof REMOVE_MESSAGE; payload: string }
  | { type: typeof SET_MODE; payload: ChatType }
  | { type: typeof SET_MODE_VOICE; payload: ChatResponseType }
  | { type: typeof SET_MESSAGE_PLAYED; payload: string };

export const assistantReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case SET_INITIAL_LOAD:
      return { ...state, isInitialLoad: action.payload };
    case SET_MESSAGE_LOADING:
      return { ...state, isMessageLoading: action.payload };
    case SET_MESSAGE_ID:
      return { ...state, userMessageId: action.payload };
    case SET_LIMIT_LOCK:
      return { ...state, isLimitLock: action.payload };
    case SET_LOADING_TEXT:
      return { ...state, messageLoadingText: action.payload };
    case SET_MESSAGE_ERROR:
      return { ...state, isMessageError: action.payload };
    case SET_STREAMED_MESSAGE:
      return { ...state, streamedMessage: action.payload };
    case APPEND_TO_STREAMED_MESSAGE:
      return {
        ...state,
        streamedMessage: {
          content:
            (state.streamedMessage?.content || '') + action.payload.content,
          runId: action.payload.run_id,
          created_at:
            state.streamedMessage?.created_at || new Date().toISOString(),
        },
      };
    case SET_MESSAGES:
      return { ...state, messages: action.payload };
    case ADD_MESSAGE:
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };
    case SET_IS_ERROR:
      return { ...state, isError: action.payload, isMessageLoading: false };
    case REMOVE_MESSAGE:
      return {
        ...state,
        messages: state.messages.filter(
          (message) => message.public_id !== action.payload
        ),
      };
    case SET_MODE:
      return { ...state, mode: action.payload };
    case SET_MODE_VOICE:
      const newState = { ...state, responseType: action.payload };
      return newState;
    case SET_MESSAGE_PLAYED:
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.public_id === action.payload
            ? { ...message, voice_played: true }
            : message
        ),
      };
    default:
      return state;
  }
};
