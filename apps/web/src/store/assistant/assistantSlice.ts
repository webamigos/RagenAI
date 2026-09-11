import type { ApiSseRetrievedSource } from '@/features/threads/contracts/events.types';
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
  /**
   * What retrieval did, per assistant message.
   *
   * Two slots rather than one, because the `retrieval` event arrives *before*
   * the message it describes exists: it is sent ahead of the first token so
   * the row can render while the answer streams, and the message id only
   * appears when the answer is saved. So the turn in flight lands in
   * `pendingRetrieval` and is filed under its id once there is one.
   *
   * Live turns only, and that is now a preference rather than the whole
   * story: a reopened thread carries its own retrieval on the message
   * (`MessageDto.retrieval`). This map wins where it has an entry, because a
   * turn that just ran also knows its chunk count, its duration and its
   * relevance scores, and none of those are stored.
   */
  retrievalByMessage: Record<string, MessageRetrieval>;
  pendingRetrieval: MessageRetrieval | null;
}

/** One turn's retrieval, as the sources block needs it. */
export interface MessageRetrieval {
  sources: ApiSseRetrievedSource[];
  /**
   * Chunks put in front of the model, and how long retrieval took.
   *
   * Present on a live turn and absent on one read back from the database,
   * which stores neither. Optional rather than zeroed: "0 chunks · 0 ms"
   * would be a claim about the retrieval instead of about what we kept, and
   * the block renders the segment only when there is a number behind it.
   */
  chunkCount?: number;
  durationMs?: number;
  /** Ids the answer cited. Empty until the `citations` event arrives. */
  citedFileIds: string[];
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
  retrievalByMessage: {},
  pendingRetrieval: null,
};

export const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    clearMessages: (state) => {
      state.messages = [];
      state.threadContext = null;
      state.isReadOnly = false;
      // Retrieval belongs to the messages it describes. Leaving it behind
      // would attach one thread's sources to another thread's answer as soon
      // as a message id repeated.
      state.retrievalByMessage = {};
      state.pendingRetrieval = null;
    },
    clearPendingRetrieval: (state) => {
      state.pendingRetrieval = null;
    },
    setPendingRetrieval: (
      state,
      action: PayloadAction<Omit<MessageRetrieval, 'citedFileIds'>>,
    ) => {
      state.pendingRetrieval = { ...action.payload, citedFileIds: [] };
    },
    setPendingCitations: (state, action: PayloadAction<string[]>) => {
      // Only ever after a retrieval: the server sends citations only when
      // something was retrieved, so no pending slot means a stream we are not
      // tracking rather than a case to invent state for.
      if (state.pendingRetrieval) {
        state.pendingRetrieval.citedFileIds = action.payload;
      }
    },
    attachPendingRetrieval: (state, action: PayloadAction<string>) => {
      if (state.pendingRetrieval) {
        state.retrievalByMessage[action.payload] = state.pendingRetrieval;
        state.pendingRetrieval = null;
      }
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
  setPendingRetrieval,
  setPendingCitations,
  attachPendingRetrieval,
  clearPendingRetrieval,
} = assistantSlice.actions;

export default assistantSlice.reducer;
