import { configureStore } from '@reduxjs/toolkit';
import sidebarReducer from '@/store/features/sidebar/sidebarSlice';
import assistantReducer from '@/store/features/assistant/assistantSlice';
import threadsReducer from '@/store/features/threads/threadsSlice';

export const store = configureStore({
  reducer: {
    sidebar: sidebarReducer,
    assistant: assistantReducer,
    threads: threadsReducer,
  },
  // Enable Redux DevTools in development
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
