import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  type MessageDto,
  type StreamedMessageDto,
  ChatResponseType,
  ChatType,
} from '@/features/messages/contracts/message.types';
import { type ThreadContext } from '@/features/threads/contracts/thread.types';
import { AssistantMode } from '@/features/assistants/contracts/assistant.types';
import voiceReducer from '../voice/voiceSlice';

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
  voice: ReturnType<typeof voiceReducer>;
  isLimitLock: boolean;
  threadContext: ThreadContext | null;
  isReadOnly: boolean;
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
  voice: voiceReducer(undefined, { type: '@@INIT' }),
  isLimitLock: false,
  threadContext: null,
  isReadOnly: false,
};

export const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    clearMessages: (state) => {
      state.messages = [];
      state.threadContext = null;
      state.isReadOnly = false;
    },
    setMessages: (state, action: PayloadAction<MessageDto[]>) => {
      state.messages = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setStreamedMessage: (
      state,
      action: PayloadAction<StreamedMessageDto | null>,
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
    setLimitLock: (state, action: PayloadAction<boolean>) => {
      state.isLimitLock = action.payload;
    },
    setMessagePlayed: (state, action: PayloadAction<string>) => {
      state.messages = state.messages.map((message) =>
        message.id === action.payload
          ? { ...message, voicePlayed: true }
          : message,
      );
    },
    setThreadContext: (state, action: PayloadAction<ThreadContext | null>) => {
      state.threadContext = action.payload;
    },
    setIsReadOnly: (state, action: PayloadAction<boolean>) => {
      state.isReadOnly = action.payload;
    },
    updateMentionedProject: (
      state,
      action: PayloadAction<{
        id: string;
        title: string;
      } | null>,
    ) => {
      if (state.threadContext) {
        state.threadContext.mentionedProject = action.payload;
        state.threadContext.mentionedProjectId = action.payload?.id || null;
      }
    },
    removeMentionedProject: (state) => {
      if (state.threadContext) {
        state.threadContext.mentionedProject = null;
        state.threadContext.mentionedProjectId = null;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addDefaultCase((state, action) => {
      if (action.type.startsWith('voice/')) {
        state.voice = voiceReducer(state.voice, action);
      }
    });
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
  setLimitLock,
  setMessagePlayed,
  clearMessages,
  setThreadContext,
  setIsReadOnly,
  updateMentionedProject,
  removeMentionedProject,
} = assistantSlice.actions;

export default assistantSlice.reducer;
