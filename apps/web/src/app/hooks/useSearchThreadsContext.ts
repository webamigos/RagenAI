import { useContext } from 'react';

import {
  SearchThreadsContext,
  type SearchThreadsContextType,
} from '@/context/SearchThreadsContext';

export const useSearchThreads = (): SearchThreadsContextType => {
  const context = useContext(SearchThreadsContext);
  if (!context) {
    throw new Error(
      'useSearchThreads must be used within a SearchThreadsProvider',
    );
  }
  return context;
};
