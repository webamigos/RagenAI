import { configureStore } from '@reduxjs/toolkit';
import sidebarReducer from '@/store/sidebar/sidebarSlice';
import assistantReducer from '@/store/assistant/assistantSlice';
import threadsReducer from '@/store/threads/threadsSlice';
import toolApprovalsReducer from '@/store/tool-approvals/toolApprovalsSlice';

export const store = configureStore({
  reducer: {
    sidebar: sidebarReducer,
    assistant: assistantReducer,
    threads: threadsReducer,
    toolApprovals: toolApprovalsReducer,
  },
  // Enable Redux DevTools in development
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
