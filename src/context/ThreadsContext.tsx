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

type ErrorState = {
  status: number | null;
  message: string | null;
};

type State = {
  userThreads: ThreadHistoryResponse[];
  error: ErrorState | null;
  isLoading: boolean;
  skip: number;
  hasMore: boolean;
};

type Action =
  | { type: 'LOADING' }
  | { type: 'USER_THREADS'; payload: ThreadHistoryResponse[] }
  | { type: 'ERROR'; payload: ErrorState }
  | { type: 'ADD_THREADS'; payload: ThreadHistoryResponse[] }
  | { type: 'ADD_THREAD'; payload: ThreadHistoryResponse }
  | { type: 'SET_HAS_MORE'; payload: boolean }
  | { type: 'INCREMENT_SKIP'; payload: number }
  | { type: 'RESET_THREADS' };

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
        userThreads: action.payload || [],
        hasMore: action.payload.length > 0,
      };
    case 'ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'ADD_THREADS':
      return {
        ...state,
        isLoading: false,
        userThreads: [...state.userThreads, ...(action.payload || [])],
      };
    case 'ADD_THREAD':
      const existingThread = state.userThreads.find(
        (thread) => thread.public_id === action.payload.public_id
      );
      if (existingThread) {
        return {
          ...state,
          userThreads: state.userThreads.map((thread) =>
            thread.public_id === action.payload.public_id
              ? {
                  ...thread,
                  messages: [...thread.messages, ...action.payload.messages],
                }
              : thread
          ),
        };
      }
      return {
        ...state,
        userThreads: [action.payload, ...state.userThreads],
      };
    case 'SET_HAS_MORE':
      return { ...state, hasMore: action.payload };
    case 'INCREMENT_SKIP':
      return { ...state, skip: state.skip + action.payload };
    case 'RESET_THREADS':
      return { ...state, userThreads: [], skip: 0, hasMore: true };
    default:
      return state;
  }
}

type ThreadsContextType = {
  state: State;
  dispatch: React.Dispatch<Action>;
  loadMoreThreads: () => void;
  refetchThreads: () => void;
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
  const { user, isSignedIn } = useUser();

  const visitorId = user?.id;

  const loadMoreThreads = useCallback(async () => {
    if (state.isLoading || !state.hasMore || !visitorId) return;

    dispatch({ type: 'LOADING' });

    try {
      const { status, error, threads } = await getUserMessages(
        visitorId,
        state.skip,
        16
      );

      if (status === 200) {
        dispatch({ type: 'ADD_THREADS', payload: threads || [] });
        dispatch({ type: 'INCREMENT_SKIP', payload: threads?.length || 0 });

        if (!threads || threads.length < 16) {
          dispatch({ type: 'SET_HAS_MORE', payload: false });
        }
      } else {
        dispatch({
          type: 'ERROR',
          payload: {
            status,
            message: error || 'Unknown error',
          },
        });
      }
    } catch (err) {
      dispatch({
        type: 'ERROR',
        payload: {
          status: 500,
          message: err?.toString() || 'Unknown error',
        },
      });
    }
  }, [state.isLoading, state.hasMore, visitorId]);

  const refetchThreads = () => {
    dispatch({ type: 'RESET_THREADS' });
    loadMoreThreads();
  };

  useEffect(() => {
    if (visitorId && !hasInitialLoadCompleted.current) {
      loadMoreThreads();
      hasInitialLoadCompleted.current = true;
    }
  }, [visitorId, loadMoreThreads]);

  useEffect(() => {
    if (!isSignedIn) {
      dispatch({ type: 'RESET_THREADS' });
      hasInitialLoadCompleted.current = false;
    }
  }, [isSignedIn]);

  return (
    <ThreadsContext.Provider
      value={{ state, dispatch, loadMoreThreads, refetchThreads }}
    >
      {children}
    </ThreadsContext.Provider>
  );
};
