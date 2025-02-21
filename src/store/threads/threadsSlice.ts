import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ThreadHistoryResponse } from '@/app/contracts/Message';

export type ErrorState = {
  status: number | null;
  message: string | null;
};

export interface ThreadState {
  userThreads: ThreadHistoryResponse[];
  error: ErrorState | null;
  isLoading: boolean;
  isThreadLoading: boolean;
  isThreadsLoaded: boolean;
  skip: number;
  hasMore: boolean;
  currentThreadId: string;
  projectId: string | null;
}

const initialState: ThreadState = {
  userThreads: [],
  error: null,
  isLoading: false,
  isThreadLoading: false,
  isThreadsLoaded: false,
  skip: 0,
  hasMore: true,
  currentThreadId: '',
  projectId: null,
};

export const threadsSlice = createSlice({
  name: 'threads',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },
    setThreadLoading: (state, action: PayloadAction<boolean>) => {
      state.isThreadLoading = action.payload;
    },
    setThreadsLoaded: (state, action: PayloadAction<boolean>) => {
      state.isThreadsLoaded = action.payload;
    },
    setUserThreads: (state, action: PayloadAction<ThreadHistoryResponse[]>) => {
      state.isLoading = false;
      state.userThreads = action.payload || [];
      state.hasMore = (action.payload || []).length > 0;
      state.isThreadsLoaded = true;
    },
    setError: (state, action: PayloadAction<ErrorState>) => {
      state.isLoading = false;
      state.error = action.payload;
    },
    addThreads: (state, action: PayloadAction<ThreadHistoryResponse[]>) => {
      const newThreads = action.payload.filter(
        (newThread) =>
          !state.userThreads.some(
            (existingThread) => existingThread.public_id === newThread.public_id
          )
      );
      state.isLoading = false;
      state.userThreads = [...state.userThreads, ...newThreads];
    },
    addThread: (state, action: PayloadAction<ThreadHistoryResponse>) => {
      const existingThreadIndex = state.userThreads.findIndex(
        (thread) => thread.public_id === action.payload.public_id
      );

      if (existingThreadIndex !== -1) {
        state.userThreads[existingThreadIndex] = {
          ...state.userThreads[existingThreadIndex],
          messages: [...action.payload.messages],
          project_id: action.payload.project_id,
        };
      } else {
        const newThread = {
          ...action.payload,
          messages: action.payload.messages || [],
          project_id: action.payload.project_id,
        };
        state.userThreads = [newThread, ...state.userThreads];
      }
    },
    setHasMore: (state, action: PayloadAction<boolean>) => {
      state.hasMore = action.payload;
    },
    incrementSkip: (state, action: PayloadAction<number>) => {
      state.skip = state.skip + action.payload;
    },
    resetThreads: (state) => {
      state.userThreads = [];
      state.skip = 0;
      state.hasMore = true;
      state.isThreadsLoaded = false;
    },
    setCurrentThreadId: (state, action: PayloadAction<string>) => {
      state.currentThreadId = action.payload;
    },
    setProjectId: (state, action: PayloadAction<string | null>) => {
      state.projectId = action.payload;
    },
  },
});

export const {
  setLoading,
  setThreadLoading,
  setThreadsLoaded,
  setUserThreads,
  setError,
  addThreads,
  addThread,
  setHasMore,
  incrementSkip,
  resetThreads,
  setCurrentThreadId,
  setProjectId,
} = threadsSlice.actions;

export default threadsSlice.reducer;
