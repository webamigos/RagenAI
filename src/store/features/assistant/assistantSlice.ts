import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  MessageDto,
  StreamedMessageDto,
  ChatResponseType,
  ChatType,
} from '@/app/contracts/Message';
import { AssistantMode } from '@/app/contracts/Assistant';

export interface AssistantState {
  messages: MessageDto[];
  isLoading: boolean;
  streamedMessage: StreamedMessageDto | null;
  error: string | null;
  messageLoadingText: string;
  responseType: ChatResponseType;
  userMessageId: string;
  isInitialLoad: boolean;
  mode: ChatType;
  assistantMode: AssistantMode;
}

const initialState: AssistantState = {
  messages: [],
  isLoading: false,
  streamedMessage: null,
  error: null,
  messageLoadingText: '',
  responseType: ChatResponseType.TEXT,
  userMessageId: '',
  isInitialLoad: true,
  mode: ChatType.CONVERSATION,
  assistantMode: AssistantMode.INTERNAL,
};

export const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    setMessages: (state, action: PayloadAction<MessageDto[]>) => {
      state.messages = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setStreamedMessage: (
      state,
      action: PayloadAction<StreamedMessageDto | null>
    ) => {
      state.streamedMessage = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setMessageLoadingText: (state, action: PayloadAction<string>) => {
      state.messageLoadingText = action.payload;
    },
    setResponseType: (state, action: PayloadAction<ChatResponseType>) => {
      state.responseType = action.payload;
    },
    setUserMessageId: (state, action: PayloadAction<string>) => {
      state.userMessageId = action.payload;
    },
    setInitialLoad: (state, action: PayloadAction<boolean>) => {
      state.isInitialLoad = action.payload;
    },
    setMode: (state, action: PayloadAction<ChatType>) => {
      state.mode = action.payload;
    },
    setAssistantMode: (state, action: PayloadAction<AssistantMode>) => {
      state.assistantMode = action.payload;
    },
  },
});

export const {
  setMessages,
  setLoading,
  setStreamedMessage,
  setError,
  setMessageLoadingText,
  setResponseType,
  setUserMessageId,
  setInitialLoad,
  setMode,
  setAssistantMode,
} = assistantSlice.actions;

export default assistantSlice.reducer;
