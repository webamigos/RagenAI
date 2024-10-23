import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useLocale } from 'next-intl';

import { useThreadsContext } from '../../hooks/useThreadsContext';
import { useNewThread } from '@/app/hooks/useNewThread';
import { useCloseThread } from '@/app/hooks/useCloseThreads';

export const useSidebarLogic = () => {
  const [activeThread, setActiveThread] = useState<string>('');
  const { state, refetchThreads } = useThreadsContext();
  const { userThreads, error, isLoading, hasMore } = state;
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const pathname = usePathname();
  const locale = useLocale();
  const userEmail = user?.emailAddresses[0].emailAddress;
  const userAvatar = user?.imageUrl;
  const isThreadsLoaded = state.userThreads.length > 0;
  const { handleNewThread } = useNewThread();
  const { handleCloseThread } = useCloseThread();

  const handleThread = () => {
    handleNewThread();
    handleCloseThread(false);
  };

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
    } else {
      setActiveThread('');
    }
  }, [pathname]);

  return {
    error,
    locale,
    hasMore,
    userEmail,
    isLoading,
    userAvatar,
    isSignedIn,
    userThreads,
    activeThread,
    handleThread,
    refetchThreads,
    isThreadsLoaded,
    handleThreadClick,
  };
};
