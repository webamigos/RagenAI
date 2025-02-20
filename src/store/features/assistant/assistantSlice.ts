import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  MessageDto,
  StreamedMessageDto,
  ChatResponseType,
} from '@/app/contracts/Message';

export interface AssistantState {
  messages: MessageDto[];
  isLoading: boolean;
  streamedMessage: StreamedMessageDto | null;
  error: string | null;
  messageLoadingText: string;
  responseType: ChatResponseType;
  userMessageId: string;
  isInitialLoad: boolean;
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
} = assistantSlice.actions;

export default assistantSlice.reducer;
