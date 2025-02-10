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
      const newThreads = action.payload.filter(
        (newThread) =>
          !state.userThreads.some(
            (existingThread) => existingThread.public_id === newThread.public_id
          )
      );
      return {
        ...state,
        isLoading: false,
        userThreads: [...state.userThreads, ...newThreads],
      };
    case 'ADD_THREAD':
      const existingThreadIndex = state.userThreads.findIndex(
        (thread) => thread.public_id === action.payload.public_id
      );

      if (existingThreadIndex !== -1) {
        const updatedThreads = [...state.userThreads];
        updatedThreads[existingThreadIndex] = {
          ...updatedThreads[existingThreadIndex],
          messages: [...action.payload.messages],
          project_id: action.payload.project_id,
        };
        return {
          ...state,
          userThreads: updatedThreads,
        };
      }

      const newThread = {
        ...action.payload,
        project_id: action.payload.project_id,
      };

      return {
        ...state,
        userThreads: [newThread, ...state.userThreads],
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
