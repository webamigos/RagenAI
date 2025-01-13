'use client';

import { useEffect, useReducer, useTransition, useCallback } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';

import { LOCAL_STORAGE_THREAD_KEY } from '@/app/components/config';
import { useCloseThread } from '@/app/hooks/useCloseThreads';
import { createThreadForGuest } from '@/app/lib/services/api';
import { statusToast } from '@/app/lib/utils/toast';

type ActionType =
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

type StateType = {
  isLoading: boolean;
  error: string | null;
};

const initialState: StateType = {
  isLoading: false,
  error: null,
};

const reducer = (state: StateType, action: ActionType): StateType => {
  switch (action.type) {
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export const useNewThread = ({
  organizationId,
  widgetMode = false,
}: {
  organizationId: string;
  widgetMode?: boolean;
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPending, startTransition] = useTransition();
  const { push } = useRouter();
  const pathname = usePathname();
  const { handleCloseThread } = useCloseThread();
  const { errorToast } = statusToast();

  const storage = widgetMode ? sessionStorage : localStorage;

  useEffect(() => {
    if (!widgetMode && !pathname.includes('/threads')) {
      storage.removeItem(LOCAL_STORAGE_THREAD_KEY);
    }
  }, [pathname, storage, widgetMode]);

  const checkExistingThread = useCallback(async () => {
    const existingThreadId = storage.getItem(LOCAL_STORAGE_THREAD_KEY);
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });

      if (existingThreadId) {
        startTransition(() =>
          push(`/public/${organizationId}/threads/${existingThreadId}`)
        );
      } else {
        await handleNewThread();
      }
    } catch (err) {
      const errorMessage = 'Failed to check existing thread.';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      errorToast({ message: errorMessage });
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  }, [organizationId, push, storage]);

  const handleNewThread = async () => {
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });
      handleCloseThread(false);

      const result = await createThreadForGuest();
      const threadId = result.data.public_id;

      storage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);

      startTransition(() =>
        push(`/public/${organizationId}/threads/${threadId}`)
      );
    } catch (err) {
      const errorMessage = 'Failed to create new thread.';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      errorToast({ message: errorMessage });
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  };

  return {
    handleNewThread,
    checkExistingThread,
    isLoading: state.isLoading,
    isPending,
    error: state.error,
  };
};
