import { useContext } from 'react';

import { ThreadsContext } from '../../context/ThreadsContext';

export const useThreadsContext = () => {
  const context = useContext(ThreadsContext);
  if (!context) {
    throw new Error(
      'useThreadsContext must be used within a ThreadsContextProvider'
    );
  }
  return context;
};
