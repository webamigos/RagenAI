import { useEffect, useTransition, useReducer, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

import { usePathname, useRouter } from '@/i18n/routing';
import { checkVisitorVisits } from '../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../components/config';
import { dailyMessageLimit } from '../config';
import { useCloseThread } from './useCloseThreads';
import { statusToast } from '../lib/utils/toast';
import { trackThreadCreated } from '../actions';
import {
  createGuestThreadAction,
  createThreadAction,
} from '../lib/actions/threads';

type ActionType =
  | { type: 'SET_VISITOR_ID'; payload: string | null }
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_IS_LIMIT_LOCK'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

type StateType = {
  visitorId: string | null;
  isLoading: boolean;
  isLimitLock: boolean;
  error: string | null;
};

const initialState: StateType = {
  visitorId: null,
  isLoading: false,
  isLimitLock: false,
  error: null,
};

const reducer = (state: StateType, action: ActionType): StateType => {
  switch (action.type) {
    case 'SET_VISITOR_ID':
      return { ...state, visitorId: action.payload };
    case 'SET_IS_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_IS_LIMIT_LOCK':
      return { ...state, isLimitLock: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export const useNewThread = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPending, setTransition] = useTransition();

  const { isSignedIn, user } = useUser();
  const { push } = useRouter();
  const pathname = usePathname();
  const { handleCloseThread } = useCloseThread();
  const { errorToast } = statusToast();

  useEffect(() => {
    const setId = async () => {
      try {
        if (isSignedIn && user?.id) {
          dispatch({
            type: 'SET_VISITOR_ID',
            payload: user?.id as string,
          });
        }
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to set visitor ID.' });
      }
    };

    setId();
  }, [isSignedIn, user]);

  const loadVisitorMessages = useCallback(async () => {
    if (!state.visitorId) {
      return;
    }
    if (pathname.includes('/threads')) {
      return;
    }

    try {
      const localStorageThreadId = localStorage.getItem(
        LOCAL_STORAGE_THREAD_KEY
      );

      if (!isSignedIn) {
        const visitorMessagesResponse = await checkVisitorVisits(
          state.visitorId
        );

        if (visitorMessagesResponse.data.messages >= dailyMessageLimit) {
          dispatch({ type: 'SET_IS_LIMIT_LOCK', payload: true });
        }
      }

      if (localStorageThreadId && !pathname.includes('/threads')) {
        push(`/threads/${localStorageThreadId}`);
      }
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'Failed to load visitor messages.',
      });
    }
  }, [state.visitorId, pathname]);

  useEffect(() => {
    loadVisitorMessages();
  }, [loadVisitorMessages]);

  useEffect(() => {
    try {
      if (!pathname.includes('/threads')) {
        localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to clear thread data.' });
    }
  }, [pathname]);

  const handleNewThread = async (initialMessage?: string) => {
    dispatch({ type: 'SET_IS_LOADING', payload: true });

    if (state.isLimitLock) {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
      return;
    }

    handleCloseThread(false);

    try {
      const result = user
        ? await createThreadAction()
        : await createGuestThreadAction();

      if (result.success) {
        trackThreadCreated();

        const threadId = result.thread.public_id;
        localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);

        setTransition(() => {
          const route = user
            ? `/threads/${threadId}`
            : `/guest-threads/${threadId}`;

          // Store the initial message in localStorage to be picked up by the thread view
          if (initialMessage) {
            localStorage.setItem(
              `thread_${threadId}_initial_message`,
              initialMessage
            );
          }

          push(route);
        });
      }
    } catch (err) {
      errorToast({ message: 'Failed to create new thread.' });
    } finally {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
    }
  };

  return {
    handleNewThread,
    isLoading: state.isLoading,
    isPending,
    isLimitLock: state.isLimitLock,
    error: state.error,
  };
};
