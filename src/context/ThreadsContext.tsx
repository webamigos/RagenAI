'use client';

import React, {
  createContext,
  useReducer,
  ReactNode,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useUser } from '@clerk/nextjs';

import type { ThreadHistoryResponse } from '../app/contracts/Message';
import { getUserMessages } from '../app/actions';

type State = {
  userThreads: ThreadHistoryResponse[];
  error: string | null;
  isLoading: boolean;
  skip: number;
  hasMore: boolean;
};

type Action =
  | { type: 'LOADING' }
  | { type: 'USER_THREADS'; payload: ThreadHistoryResponse[] }
  | { type: 'ERROR'; payload: string }
  | { type: 'ADD_THREADS'; payload: ThreadHistoryResponse[] }
  | { type: 'SET_HAS_MORE'; payload: boolean }
  | { type: 'INCREMENT_SKIP'; payload: number };

const initialState: State = {
  userThreads: [],
  error: null,
  isLoading: false,
  skip: 0,
  hasMore: true,
};

function threadsReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':
      return { ...state, isLoading: true, error: null };
    case 'USER_THREADS':
      return {
        ...state,
        isLoading: false,
        userThreads: action.payload,
        hasMore: action.payload.length > 0,
      };
    case 'ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'ADD_THREADS':
      return {
        ...state,
        isLoading: false,
        userThreads: [...state.userThreads, ...action.payload],
      };
    case 'SET_HAS_MORE':
      return { ...state, hasMore: action.payload };
    case 'INCREMENT_SKIP':
      return { ...state, skip: state.skip + action.payload };
    default:
      return state;
  }
}

type ThreadsContextType = {
  state: State;
  dispatch: React.Dispatch<Action>;
  loadMoreThreads: () => void;
};

export const ThreadsContext = createContext<ThreadsContextType | undefined>(
  undefined
);

type ThreadsContextProviderProps = {
  children: ReactNode;
};

export const ThreadsContextProvider = ({
  children,
}: ThreadsContextProviderProps) => {
  const [state, dispatch] = useReducer(threadsReducer, initialState);
  const hasInitialLoadCompleted = useRef(false);
  const { user } = useUser();
  const visitorId = user?.unsafeMetadata.visitorId;

  const loadMoreThreads = useCallback(async () => {
    if (state.isLoading || !state.hasMore) return;

    if (!visitorId) {
      return;
    }

    dispatch({ type: 'LOADING' });

    try {
      const response = await getUserMessages(
        visitorId as string,
        state.skip,
        16
      );
      const threads = response.threads || [];

      if (threads.length > 0) {
        dispatch({ type: 'ADD_THREADS', payload: threads });
        dispatch({ type: 'INCREMENT_SKIP', payload: threads.length });

        if (threads.length < 16) {
          dispatch({ type: 'SET_HAS_MORE', payload: false });
        }
      } else {
        dispatch({ type: 'USER_THREADS', payload: [] });
        dispatch({ type: 'SET_HAS_MORE', payload: false });
      }
    } catch (error) {
      dispatch({ type: 'ERROR', payload: 'Failed to load more threads' });
    }
  }, [state, visitorId]);

  useEffect(() => {
    if (!hasInitialLoadCompleted.current && visitorId) {
      loadMoreThreads();
      hasInitialLoadCompleted.current = true;
    }
  }, [loadMoreThreads, visitorId]);

  return (
    <ThreadsContext.Provider value={{ state, dispatch, loadMoreThreads }}>
      {children}
    </ThreadsContext.Provider>
  );
};
