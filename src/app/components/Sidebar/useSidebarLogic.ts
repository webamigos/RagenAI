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
import {
  setActiveThread,
  setProjects,
  closeSidebar,
  setCreateModalOpen,
} from '@/store/features/sidebar/sidebarSlice';
import {
  setLoading,
  addThreads,
  incrementSkip,
  setHasMore,
  setError,
  resetThreads,
} from '@/store/features/threads/threadsSlice';
import type { ErrorState } from '@/store/features/threads/threadsSlice';

export const useSidebarLogic = () => {
  const dispatch = useAppDispatch();
  const { isOpen, activeThread, projects, isCreateModalOpen } = useAppSelector(
    (state) => state.sidebar
  );

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

  const loadMoreThreads = useCallback(async () => {
    if (isLoading || !hasMore || !user?.id) return;

    dispatch(setLoading(true));

    try {
      const { status, error, threads } = await getUserMessages(
        user.id,
        skip,
        16
      );

      if (status === 200) {
        dispatch(addThreads(threads || []));
        dispatch(incrementSkip(threads?.length || 0));

        if (!threads || threads.length < 16) {
          dispatch(setHasMore(false));
        }
      } else {
        const errorPayload = {
          status,
          message: error || 'Unknown error',
        };
        dispatch(setError(errorPayload));
      }
    } catch (err) {
      const errorPayload = {
        status: 500,
        message: err?.toString() || 'Unknown error',
      };
      dispatch(setError(errorPayload));
    }
  }, [isLoading, hasMore, user?.id, skip, dispatch]);

  const refetchThreads = useCallback(() => {
    dispatch(resetThreads());
    loadMoreThreads();
  }, [dispatch, loadMoreThreads]);

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
    if (user?.id) {
      loadMoreThreads();
    }
  }, [user?.id, loadMoreThreads]);

  useEffect(() => {
    if (!isSignedIn) {
      dispatch(resetThreads());
    }
  }, [isSignedIn, dispatch]);

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
