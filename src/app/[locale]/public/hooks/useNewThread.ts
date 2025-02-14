'use client';

import {
  useReducer,
  useTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import Cookies from 'js-cookie';

import { LOCAL_STORAGE_THREAD_KEY } from '@/app/components/config';
import { useCloseThread } from '@/app/hooks/useCloseThreads';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { useSessionStorage } from './useSessionStorage';
import { createGuestThreadAction } from '@/app/lib/actions/threads';
import { visitorCookieName } from '@/app/config';

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
  const [visitorId, setVisitorId] = useState('');
  const [isPending, startTransition] = useTransition();
  const { push } = useRouter();
  const pathname = usePathname();
  const { handleCloseThread } = useCloseThread();
  const { errorToast } = statusToast();

  const {
    storedValue: threadId,
    setValue: setThreadId,
    removeValue: removeThreadId,
  } = useSessionStorage<string | null>(LOCAL_STORAGE_THREAD_KEY, null);

  const handleNewThread = async () => {
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });
      handleCloseThread(false);

      const result = await createGuestThreadAction();

      if (!result.success) {
        throw new Error('Invalid response from server - missing thread ID');
      }

      const newThreadId = result.thread.public_id;
      setThreadId(newThreadId);

      startTransition(() =>
        push(`/public/${organizationId}/threads/${newThreadId}`)
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create new thread.';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      errorToast({ message: errorMessage });
      logger.error({ err }, 'Failed to create new thread');
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  };

  const checkExistingThread = useCallback(async () => {
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });

      if (threadId) {
        startTransition(() =>
          push(`/public/${organizationId}/threads/${threadId}`)
        );
        return;
      }

      await handleNewThread();
    } catch (err) {
      const errorMessage = 'Failed to check existing thread.';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      errorToast({ message: errorMessage });
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  }, [organizationId, threadId]);

  useEffect(() => {
    const visitorCookieValue = Cookies.get(visitorCookieName);
    if (visitorCookieValue) {
      setVisitorId(visitorCookieValue);
    }
  }, []);

  useEffect(() => {
    if (!widgetMode && !pathname.includes('/threads')) {
      removeThreadId();
    }
  }, [pathname, widgetMode, removeThreadId]);

  return {
    handleNewThread,
    checkExistingThread,
    isLoading: state.isLoading,
    isPending,
    error: state.error,
  };
};
