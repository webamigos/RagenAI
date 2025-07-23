import {
  SidebarBody,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@ragenai/tui/sidebar';
import {
  Cog6ToothIcon,
  HomeIcon,
  MegaphoneIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  Square2StackIcon,
  TicketIcon,
} from '@heroicons/react/20/solid';

import { useAppSelector } from '@/store/hooks';
import { usePathname } from '@/i18n/routing';
import { useSettings } from '@/app/hooks/useSettings';

import { TUIProjectsList } from './TUIProjectsList';
import { TUIUserThreadsHistory } from './TUIUserThreadsHistory';
import { useSidebarLogic } from '../useSidebarLogic';

export const NewMainSidebarBody = () => {
  const pathname = usePathname();
  const { hasKnowledge } = useSettings();

  const {
    error,
    hasMore,
    projects,
    isLoading,
    isSignedIn,
    userThreads,
    activeThread,
    isThreadsLoaded,
    isCreateModalOpen,
    setIsCreateModalOpen,
    loadMoreThreads,
    refreshProjects,
    refetchThreads,
    getSidebarThreadsError,
  } = useSidebarLogic();

  const { defaultProjectPublicId } = useAppSelector((state) => state.threads);

  const projectsWithoutDefault = projects.filter(
    (project) => project.public_id !== defaultProjectPublicId
  );
  const onboardingInProgress =
    !hasKnowledge && projectsWithoutDefault.length === 0;

  const shouldShowMainContent =
    pathname === '/' ||
    pathname.includes('/threads') ||
    pathname.includes('assistants');

  return (
    <SidebarBody>
      {shouldShowMainContent ? (
        <>
          {/* Projects Section */}
          {!error && (
            <TUIProjectsList
              isLoading={isLoading}
              projects={projectsWithoutDefault}
              setIsCreateModalOpen={setIsCreateModalOpen}
              activeThread={activeThread}
              isCreateModalOpen={isCreateModalOpen}
              refreshProjects={refreshProjects}
            />
          )}

          {/* Threads History Section */}
          {!onboardingInProgress && !error && (
            <TUIUserThreadsHistory
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

          {/* Error State */}
          {error && !isLoading && (
            <SidebarSection>
              <div className="flex flex-col items-center text-center p-4">
                <div className="text-red-500 dark:text-red-400 text-sm mb-2">
                  {getSidebarThreadsError(error)}
                </div>
                <button
                  onClick={refetchThreads}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-md transition-colors font-medium"
                >
                  {isLoading ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            </SidebarSection>
          )}
        </>
      ) : (
        <>
          {/* Default navigation sections for non-main pages */}
          <SidebarSection>
            <SidebarItem href="/">
              <HomeIcon data-slot="icon" />
              <SidebarLabel>Home</SidebarLabel>
            </SidebarItem>
            <SidebarItem href="/settings">
              <Cog6ToothIcon data-slot="icon" />
              <SidebarLabel>Settings</SidebarLabel>
            </SidebarItem>
          </SidebarSection>
          <SidebarSpacer />
          <SidebarSection>
            <SidebarItem href="/support">
              <QuestionMarkCircleIcon data-slot="icon" />
              <SidebarLabel>Support</SidebarLabel>
            </SidebarItem>
          </SidebarSection>
        </>
      )}
    </SidebarBody>
  );
};
