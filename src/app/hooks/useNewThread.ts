import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useTransition, useReducer } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  checkVisitorVisits,
  createThread,
  createThreadForGuest,
} from '../lib/services/api';
import { LOCAL_STORAGE_THREAD_KEY } from '../components/config';
import { dailyMessageLimit } from '../config';
import { useLocale } from 'next-intl';
import { useCloseThread } from './useCloseThreads';
import { statusToast } from '../lib/utils/toast';

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
  const locale = useLocale();
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

  useEffect(() => {
    const loadVisitorMessages = async () => {
      if (!state.visitorId) return;

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
          push(`/${locale}/threads/${localStorageThreadId}`);
        }
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Failed to load visitor messages.',
        });
      }
    };

    loadVisitorMessages();
  }, [state.visitorId, pathname]);

  useEffect(() => {
    try {
      if (!pathname.includes('/threads')) {
        localStorage.removeItem(LOCAL_STORAGE_THREAD_KEY);
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to clear thread data.' });
    }
  }, [pathname]);

  const handleNewThread = async () => {
    try {
      dispatch({ type: 'SET_IS_LOADING', payload: true });

      if (!state.isLimitLock) {
        handleCloseThread(false);

        const result = user
          ? await createThread()
          : await createThreadForGuest();

        const threadId = result.data.public_id;
        localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);

        user
          ? setTransition(() => push(`/${locale}/threads/${threadId}`))
          : setTransition(() => push(`/${locale}/guest-threads/${threadId}`));

        dispatch({ type: 'SET_IS_LOADING', payload: false });
      }
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'Failed to create new thread.',
      });
      errorToast({ message: state.error! });
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
