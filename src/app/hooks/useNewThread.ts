'use client';

import {
  useEffect,
  useTransition,
  useReducer,
  useCallback,
  useState,
} from 'react';
import { useUser } from '@clerk/nextjs';
import { usePathname, useRouter } from '@/i18n/routing';
import { useAppDispatch } from '@/store/hooks';
import { addThread } from '@/store/threads/threadsSlice';

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
import { getVisitorIdFromBrowserCookie } from '../lib/services/cookies.browser';
import { getProjectByPublicId } from '@/app/lib/services/project';

type ActionType =
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_IS_LIMIT_LOCK'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

type StateType = {
  isLoading: boolean;
  isLimitLock: boolean;
  error: string | null;
};

const initialState: StateType = {
  isLoading: false,
  isLimitLock: false,
  error: null,
};

const reducer = (state: StateType, action: ActionType): StateType => {
  switch (action.type) {
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
  const [visitorId, setVisitorId] = useState('');
  const [isPending, startTransition] = useTransition();
  const reduxDispatch = useAppDispatch();

  const { isSignedIn, user } = useUser();
  const { push } = useRouter();
  const pathname = usePathname();
  const { handleCloseThread } = useCloseThread();
  const { errorToast } = statusToast();

  useEffect(() => {
    const visitorCookieValue = getVisitorIdFromBrowserCookie();
    if (visitorCookieValue) {
      setVisitorId(visitorCookieValue);
    }
  }, []);

  const loadVisitorMessages = useCallback(async () => {
    if (!visitorId) {
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
        const visitorMessagesResponse = await checkVisitorVisits(visitorId);

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
  }, [visitorId, pathname]);

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

  const handleNewThread = async (
    initialMessage?: string,
    projectPublicId?: string
  ) => {
    dispatch({ type: 'SET_IS_LOADING', payload: true });

    if (state.isLimitLock) {
      dispatch({ type: 'SET_IS_LOADING', payload: false });
      return;
    }

    handleCloseThread(false);

    try {
      let projectId: number | undefined;

      const result = user
        ? await createThreadAction(projectId)
        : await createGuestThreadAction();

      if (result.success) {
        trackThreadCreated();

        const threadId = result.thread.public_id;
        localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);

        // Add thread to Redux store
        reduxDispatch(
          addThread({
            public_id: threadId,
            project_id: projectId,
            messages: [],
            created_at: new Date(),
          })
        );

        startTransition(() => {
          const route = user
            ? projectPublicId
              ? `/projects/${projectPublicId}/threads/${threadId}`
              : `/threads/${threadId}`
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
