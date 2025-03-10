import { useEffect, useCallback } from 'react';
import { useUser, useOrganization } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';
import { useNewThread } from '../../hooks/useNewThread';
import { useCloseThread } from '../../hooks/useCloseThreads';
import { useOnboardingContext } from '../../hooks/useOnboardingContext';
import { useSearchThreads } from '../../hooks/useSearchThreadsContext';
import { getUserMessages } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';
import {
  setActiveThread,
  setProjects,
  closeSidebar,
  setCreateModalOpen,
} from '@/store/sidebar/sidebarSlice';
import {
  setLoading,
  addThreads,
  incrementSkip,
  setHasMore,
  setError,
  resetThreads,
} from '@/store/threads/threadsSlice';
import type { ErrorState } from '@/store/threads/threadsSlice';
import { logger } from '@/app/lib/utils/logger';
export const useSidebarLogic = () => {
  const dispatch = useAppDispatch();
  const { activeThread, projects, isCreateModalOpen } = useAppSelector(
    (state) => state.sidebar
  );
  const { errorToast } = statusToast();

  const {
    error,
    isLoading,
    hasMore,
    isThreadLoading,
    isThreadsLoaded,
    userThreads,
    skip,
  } = useAppSelector((state) => state.threads);

  const { user, isSignedIn } = useUser();
  const pathname = usePathname();
  const locale = useLocale();
  const userEmail = user?.emailAddresses[0].emailAddress;
  const userAvatar = user?.imageUrl;
  const { handleNewThread } = useNewThread();
  const { handleCloseThread } = useCloseThread();
  const { showOnboarding } = useOnboardingContext();
  const t = useTranslations('sidebar');
  const { openSearch } = useSearchThreads();
  const { organization } = useOrganization();

  const prefetchThreads = useCallback(
    async (userId: string, skipCount: number, limit: number) => {
      try {
        await getUserMessages(userId, skipCount, limit);
      } catch (error) {
        logger.error({ err: error }, 'Error prefetching threads');
        return errorToast({ message: 'Error prefetching threads' });
      }
    },
    []
  );

  const loadMoreThreads = useCallback(async () => {
    if (isLoading || !hasMore || !user?.id) return;

    const viewportHeight = window.innerHeight;
    const avgThreadHeight = 100;
    const limit = Math.ceil(viewportHeight / avgThreadHeight) + 5;

    dispatch(setLoading(true));

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const { status, error, threads } = await getUserMessages(
          user.id,
          skip,
          limit
        );

        if (status === 200) {
          if (threads?.length) {
            dispatch(addThreads(threads));
            dispatch(incrementSkip(threads.length));
            dispatch(setHasMore(threads.length === limit));

            if (threads.length === limit) {
              prefetchThreads(user.id, skip + limit, limit);
            }
          } else {
            dispatch(setHasMore(false));
          }
          break;
        }
        throw new Error(error);
      } catch (err) {
        retryCount++;
        if (retryCount === maxRetries) {
          dispatch(
            setError({
              status: 500,
              message: err?.toString() || 'Unknown error',
            })
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }

    dispatch(setLoading(false));
  }, [isLoading, hasMore, user?.id, skip, dispatch, prefetchThreads]);

  const refetchThreads = useCallback(async () => {
    const cachedThreads = [...userThreads];
    try {
      dispatch(resetThreads());
      await loadMoreThreads();
    } catch {
      dispatch(addThreads(cachedThreads));
    }
  }, [dispatch, loadMoreThreads, userThreads]);

  const handleThread = () => {
    handleNewThread();
    handleCloseThread(false);
    dispatch(closeSidebar());
  };

  const handleSearch = () => {
    openSearch();
    dispatch(closeSidebar());
  };

  function getSidebarThreadsError(error: ErrorState): string {
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
    const projectIndex = parts.indexOf('projects');

    if (threadIndex !== -1 && parts[threadIndex + 1]) {
      const threadId = parts[threadIndex + 1];
      dispatch(setActiveThread(threadId));
    } else if (
      projectIndex !== -1 &&
      parts[projectIndex + 2] === 'threads' &&
      parts[projectIndex + 3]
    ) {
      const threadId = parts[projectIndex + 3];
      dispatch(setActiveThread(threadId));
    } else {
      dispatch(setActiveThread(undefined));
    }
  }, [pathname, dispatch]);

  const fetchProjects = async () => {
    if (!organization?.id || !user?.id) {
      return;
    }
    const fetchedProjects = await getProjects(organization.id, user.id);

    if (fetchedProjects.projects) {
      dispatch(setProjects(fetchedProjects.projects));
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [organization?.id, user?.id]);

  useEffect(() => {
    let mounted = true;

    if (user?.id && mounted && !isThreadsLoaded) {
      loadMoreThreads();
    }

    return () => {
      mounted = false;
    };
  }, [user?.id, loadMoreThreads, isThreadsLoaded]);

  useEffect(() => {
    if (!isSignedIn) {
      dispatch(resetThreads());
    }
  }, [isSignedIn, dispatch]);

  // Refresh projects when new thread is added
  useEffect(() => {
    const parts = pathname.split('/');
    const isInProjectContext = parts.includes('projects');

    if (organization?.id && user?.id && isInProjectContext) {
      fetchProjects();
    }
  }, [organization?.id, user?.id, userThreads.length, pathname]);

  return {
    error,
    locale,
    hasMore,
    projects,
    userEmail,
    isLoading,
    userAvatar,
    isSignedIn,
    userThreads,
    activeThread,
    handleSearch,
    handleThread,
    showOnboarding,
    refetchThreads,
    isThreadLoading,
    isThreadsLoaded,
    isCreateModalOpen,
    handleCloseThread,
    loadMoreThreads,
    setIsCreateModalOpen: (value: boolean) =>
      dispatch(setCreateModalOpen(value)),
    getSidebarThreadsError,
    refreshProjects: fetchProjects,
  };
};
