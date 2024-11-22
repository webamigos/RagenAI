import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';

import { useThreadsContext } from '../../hooks/useThreadsContext';
import { useNewThread } from '@/app/hooks/useNewThread';
import { useCloseThread } from '@/app/hooks/useCloseThreads';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';

type SidebarThreadsFetchError = {
  status: number | null;
  message: string | null;
};

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
  const { showOnboarding } = useOnboardingContext();
  const t = useTranslations('sidebar');

  const handleThread = () => {
    handleNewThread();
    handleCloseThread(false);
  };

  const handleThreadClick = (threadId: string) => {
    router.push(`/threads/${threadId}`);
    setActiveThread(threadId);
  };

  function getSidebarThreadsError(error: SidebarThreadsFetchError): string {
    switch (error.status) {
      case 400:
        if (error.message?.includes('prisma')) {
          return t('errors.database-connection');
        }
        return t('errors.general');
      case 401:
        return t('errors.missing-permissions');
      case 404:
        return t('errors.fetch-failed');
      case 500:
        return t('errors.unknown');
      default:
        return t('errors.unknown');
    }
  }

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
    showOnboarding,
    refetchThreads,
    isThreadsLoaded,
    handleThreadClick,
    getSidebarThreadsError,
  };
};
