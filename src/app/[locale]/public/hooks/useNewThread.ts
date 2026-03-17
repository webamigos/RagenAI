'use client';

import { useReducer, useTransition, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import { useCloseThread } from '@/app/hooks/useCloseThreads';
import { createGuestThreadCommand as createGuestThreadAction } from '@/features/threads/services/commands/create-guest-thread-command';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { useDispatch } from 'react-redux';
import { clearMessages } from '@/store/assistant/assistantSlice';
import { SESSION_STORAGE_TEMP_MESSAGE_KEY } from '@/app/components/config';

const PUBLIC_THREAD_PREFIX = 'public_thread_';

function getStoredThreadId(accessToken: string): string | null {
  try {
    return localStorage.getItem(`${PUBLIC_THREAD_PREFIX}${accessToken}`);
  } catch {
    return null;
  }
}

function setStoredThreadId(accessToken: string, threadId: string) {
  try {
    localStorage.setItem(`${PUBLIC_THREAD_PREFIX}${accessToken}`, threadId);
  } catch {
    // localStorage unavailable
  }
}

function removeStoredThreadId(accessToken: string) {
  try {
    localStorage.removeItem(`${PUBLIC_THREAD_PREFIX}${accessToken}`);
  } catch {
    // localStorage unavailable
  }
}

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
  accessToken,
  projectId,
  organizationId,
  widgetMode = false,
}: {
  accessToken: string;
  projectId: number;
  organizationId?: string;
  widgetMode?: boolean;
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPending, startTransition] = useTransition();
  const { push } = useRouter();
  const { handleCloseThread } = useCloseThread();
  const { errorToast } = statusToast();
  const reduxDispatch = useDispatch();

  const handleNewThread = useCallback(
    async (
      initialMessage?: string,
      passedProjectId?: number,
      projectPublicId?: string,
      mentionedProjectId?: number,
      preferredModel?: string,
    ) => {
      try {
        dispatch({ type: 'SET_IS_LOADING', payload: true });
        handleCloseThread(false);
        reduxDispatch(clearMessages());

        const result = await createGuestThreadAction({
          organizationId,
          projectId: passedProjectId ?? projectId,
          initialMessage,
          mentionedProjectId,
          preferredModel,
        });

        if (!result.success) {
          throw new Error('Invalid response from server');
        }

        const newThreadId = result.thread.publicId;
        setStoredThreadId(accessToken, newThreadId);

        if (initialMessage) {
          sessionStorage.setItem(
            SESSION_STORAGE_TEMP_MESSAGE_KEY,
            initialMessage,
          );
        }

        startTransition(() =>
          push(`/public/assistants/${accessToken}/threads/${newThreadId}`),
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
    },
    [
      dispatch,
      handleCloseThread,
      reduxDispatch,
      organizationId,
      projectId,
      startTransition,
      push,
      accessToken,
      errorToast,
    ],
  );

  const checkExistingThread = useCallback(async () => {
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });

      const storedThread = getStoredThreadId(accessToken);
      if (storedThread) {
        startTransition(() =>
          push(`/public/assistants/${accessToken}/threads/${storedThread}`),
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
  }, [accessToken, startTransition, push, handleNewThread, errorToast]);

  /** Get the stored thread ID for this assistant (if any) */
  const getRecentThreadId = useCallback(() => {
    return getStoredThreadId(accessToken);
  }, [accessToken]);

  /** Clear the stored thread for this assistant */
  const clearRecentThread = useCallback(() => {
    removeStoredThreadId(accessToken);
  }, [accessToken]);

  return {
    handleNewThread,
    checkExistingThread,
    getRecentThreadId,
    clearRecentThread,
    isLoading: state.isLoading,
    isPending,
    error: state.error,
  };
};
