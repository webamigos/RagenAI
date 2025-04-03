'use client';

import Link from 'next/link';

import {
  SidebarBody,
  SidebarLayout,
  Text,
  Button,
  SearchIcon,
  ArrowIcon,
} from '@ragenai/common-ui';
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/routing';
import { UserThreadsHistory } from './ThreadsHistory/UserThreadsHistory';
import { Header } from './Header';
import { useSidebarLogic } from '@/app/components/Sidebar/useSidebarLogic';
import { UserAndOrganizationNavigation } from './MyProfileSection';
import { OrganizationRoles } from '@/app/contracts/User';
import { DesktopNavbar } from './DesktopNavbar';
import { CreateThreadButton } from './CreateThreadButton';
import { ProjectsList } from './Projects/ProjectsList';
import { ManageKnowledgeButton } from './ManageKnowledgeButton';
import { OnboardingCard } from './OnboardingCard';
import { useSettings } from '@/app/hooks/useSettings';

type Props = {
  children: React.ReactNode;
  membership?: OrganizationRoles;
  defaultPublicProjectId: string | null;
};

export const Sidebar = ({
  children,
  membership,
  defaultPublicProjectId,
}: Props) => {
  const {
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
    refetchThreads,
    isThreadLoading,
    isThreadsLoaded,
    isCreateModalOpen,
    handleCloseThread,
    setIsCreateModalOpen,
    getSidebarThreadsError,
    refreshProjects,
    loadMoreThreads,
  } = useSidebarLogic();
  const pathname = usePathname();
  const isError = error ? true : false;
  const t = useTranslations('sidebar');
  const { hasKnowledge } = useSettings();

  const projectsWithoutDefault = projects.filter(
    (project) => project.public_id !== defaultPublicProjectId
  );
  const onboardingInProgress =
    !hasKnowledge && projectsWithoutDefault.length === 0;

  return (
    <SidebarLayout
      navbar={<DesktopNavbar userEmail={userEmail} userAvatar={userAvatar} />}
      sidebar={
        <div className="flex w-full flex-col h-full text-sm border-r-2 dark:bg-secondary-dark bg-blue-50 dark:border-slate-800 border-slate-200">
          <Header />
          <div className="flex flex-col mb-5">
            {pathname === '/' ||
            pathname.includes('/threads') ||
            pathname.includes('assistants') ||
            pathname === `/${locale}/support` ? (
              <>
                {onboardingInProgress && (
                  <OnboardingCard setIsCreateModalOpen={setIsCreateModalOpen} />
                )}
                {!onboardingInProgress && (
                  <CreateThreadButton
                    isThreadLoading={isThreadLoading}
                    handleThread={handleThread}
                  />
                )}
                {!onboardingInProgress && <ManageKnowledgeButton />}
              </>
            ) : (
              <Link href={'/'}>
                <Button
                  isLink
                  onClick={() => handleCloseThread(true)}
                  className="relative ml-3 w-10/12"
                >
                  <ArrowIcon className="w-5 h-5 dark:text-gray-200" />
                  <Text
                    color="gray-700"
                    fontWeight="medium"
                    className="ml-3 dark:text-gray-100"
                  >
                    {t('return-to-home')}
                  </Text>
                </Button>
              </Link>
            )}
            {isSignedIn &&
              !pathname.includes('/my-profile') &&
              !pathname.includes('/manage-knowledge') &&
              !pathname.includes('generate-access-key') &&
              !pathname.includes('/support') &&
              !onboardingInProgress && (
                <Button
                  onClick={handleSearch}
                  className="relative ml-4 w-10/12 flex hover:bg-gray-200"
                  isLink
                >
                  <SearchIcon className="w-5 h-5 dark:text-gray-200" />
                  <Text className="ml-1">{t('search-threads')}</Text>
                </Button>
              )}
          </div>
          <SidebarBody className="-mt-3.5">
            {pathname === `/` ||
            pathname.includes('threads') ||
            pathname.includes('assistants') ? (
              error ? (
                <div className="flex flex-col items-center text-start">
                  <Text color="red-500">{getSidebarThreadsError(error)}</Text>
                  <Button isError={isError} onClick={refetchThreads} />
                </div>
              ) : (
                <>
                  <ProjectsList
                    isLoading={isLoading}
                    projects={projectsWithoutDefault}
                    setIsCreateModalOpen={setIsCreateModalOpen}
                    activeThread={activeThread}
                    isCreateModalOpen={isCreateModalOpen}
                    refreshProjects={refreshProjects}
                  />

                  {!onboardingInProgress && (
                    <UserThreadsHistory
                      error={error}
                      hasMore={hasMore}
                      isLoading={isLoading}
                      isSignedIn={isSignedIn}
                      userThreads={userThreads}
                      activeThread={activeThread}
                      isThreadsLoaded={isThreadsLoaded}
                      loadMoreThreads={loadMoreThreads}
                    />
                  )}
                </>
              )
            ) : (
              <UserAndOrganizationNavigation membership={membership} />
            )}
          </SidebarBody>
        </div>
      }
    >
      {children}
    </SidebarLayout>
  );
};
