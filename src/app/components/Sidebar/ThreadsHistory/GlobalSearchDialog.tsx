'use client';

import { useUser } from '@/app/hooks/use-auth';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { SearchThreads } from './SearchThreads';

export const GlobalSearchDialog = () => {
  const { user } = useUser();
  const { isSearchOpen } = useSearchThreads();

  if (!isSearchOpen || !user?.id) {
    return null;
  }

  return <SearchThreads visitorId={user.id} />;
};
