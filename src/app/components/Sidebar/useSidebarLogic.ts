import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useOrganization } from '@clerk/nextjs';

import { useThreadsContext } from '../../hooks/useThreadsContext';
import { useNewThread } from '@/app/hooks/useNewThread';
import { useCloseThread } from '@/app/hooks/useCloseThreads';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';
import { useSidebar } from '@/app/hooks/useSidebar';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';

import type { ProjectType } from './Projects/types';

type SidebarThreadsFetchError = {
  status: number | null;
  message: string | null;
};

export const useSidebarLogic = () => {
  const [activeThread, setActiveThread] = useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectType[]>([]);

  const { state, refetchThreads } = useThreadsContext();
  const { userThreads, error, isLoading, hasMore } = state;
  const { user, isSignedIn } = useUser();
  const { organization } = useOrganization();
  const pathname = usePathname();
  const locale = useLocale();
  const userEmail = user?.emailAddresses[0].emailAddress;
  const userAvatar = user?.imageUrl;
  const isThreadsLoaded = state.userThreads.length > 0;
  const { handleNewThread, isLoading: isThreadLoading } = useNewThread();
  const { handleCloseThread } = useCloseThread();
  const { showOnboarding } = useOnboardingContext();
  const t = useTranslations('sidebar');
  const { closeSidebar } = useSidebar();
  const { openSearch } = useSearchThreads();

  const handleThread = () => {
    handleNewThread();
    handleCloseThread(false);
    closeSidebar();
  };

  const handleSearch = () => {
    openSearch();
    closeSidebar();
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
    const projectIndex = parts.indexOf('projects');

    if (threadIndex !== -1 && parts[threadIndex + 1]) {
      const threadId = parts[threadIndex + 1];
      setActiveThread(threadId);
    } else if (
      projectIndex !== -1 &&
      parts[projectIndex + 2] === 'threads' &&
      parts[projectIndex + 3]
    ) {
      const threadId = parts[projectIndex + 3];
      setActiveThread(threadId);
    } else {
      setActiveThread('');
    }
  }, [pathname]);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!organization?.id || !user?.id) {
        return;
      }
      const fetchedProjects = await getProjects(organization.id, user.id);

      if (fetchedProjects.projects) {
        setProjects(fetchedProjects.projects);
      }
    };

    fetchProjects();
  }, [organization?.id, user?.id]);

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
    handleCloseThread,
    getSidebarThreadsError,
    isCreateModalOpen,
    setIsCreateModalOpen,
  };
};
