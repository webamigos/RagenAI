'use client';

import React, { createContext, useReducer, ReactNode, useContext } from 'react';

import type { ThreadHistoryResponse } from '../app/contracts/Message';

type State = {
  userThreads: ThreadHistoryResponse[];
  error: string | null;
  isLoading: boolean;
};

type Action =
  | { type: 'LOADING' }
  | { type: 'USER_THREADS'; payload: ThreadHistoryResponse[] }
  | { type: 'ERROR'; payload: string };

const initialState: State = {
  userThreads: [],
  error: null,
  isLoading: false,
};

function threadsReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':
      return { ...state, isLoading: true, error: null };
    case 'USER_THREADS':
      return { ...state, isLoading: false, userThreads: action.payload };
    case 'ERROR':
      return { ...state, isLoading: false, error: action.payload };
    default:
      return state;
  }
}

type ThreadsContextType = {
  state: State;
  dispatch: React.Dispatch<Action>;
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

  return (
    <ThreadsContext.Provider value={{ state, dispatch }}>
      {children}
    </ThreadsContext.Provider>
  );
};
