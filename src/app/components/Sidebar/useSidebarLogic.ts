import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

import { useThreadsContext } from '../../hooks/useThreadsContext';

export const useSidebarLogic = () => {
  const [activeThread, setActiveThread] = useState<string>('');
  const { state } = useThreadsContext();
  const { userThreads, error, isLoading, hasMore } = state;
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const pathname = usePathname();

  const userEmail = user?.emailAddresses[0].emailAddress;

  const handleThreadClick = (threadId: string) => {
    router.push(`/threads/${threadId}`);
    setActiveThread(threadId);
  };

  useEffect(() => {
    const parts = pathname.split('/');
    const threadIndex = parts.indexOf('threads');

    if (threadIndex !== -1 && parts[threadIndex + 1]) {
      const threadId = parts[threadIndex + 1];
      setActiveThread(threadId);
    }
  }, [pathname]);

  return {
    error,
    hasMore,
    userEmail,
    isLoading,
    isSignedIn,
    userThreads,
    activeThread,
    handleThreadClick,
  };
};
