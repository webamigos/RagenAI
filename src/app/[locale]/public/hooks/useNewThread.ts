import { useEffect, useReducer, useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/routing';
import { LOCAL_STORAGE_THREAD_KEY } from '@/app/components/config';
import { useCloseThread } from '@/app/hooks/useCloseThreads';
import { createThreadForGuest } from '@/app/lib/services/api';
import { statusToast } from '@/app/lib/utils/toast';
import { useLocale } from 'next-intl';

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
}: {
  organizationId: string;
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPending, setTransition] = useTransition();

  const { push } = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { handleCloseThread } = useCloseThread();
  const { errorToast } = statusToast();

  // Check for existing thread and redirect if found
  useEffect(() => {
    try {
      const localStorageThreadId = localStorage.getItem(
        LOCAL_STORAGE_THREAD_KEY
      );

      if (localStorageThreadId && !pathname.includes('/threads')) {
        push(`/public/${organizationId}/threads/${localStorageThreadId}`);
      }

      // Clear thread data when not in a thread
      if (!pathname.includes('/threads')) {
        localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to manage thread data.' });
    }
  }, [pathname, organizationId, locale, push]);

  const handleNewThread = async () => {
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });
      handleCloseThread(false);

      const result = await createThreadForGuest();
      const threadId = result.data.public_id;

      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
      setTransition(() =>
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
    isLoading: state.isLoading,
    isPending,
    error: state.error,
  };
};
