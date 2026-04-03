'use client';

import { useTranslations } from 'next-intl';
import { PlusIcon, FolderPlusIcon } from '@heroicons/react/20/solid';

import { SidebarSection, SidebarHeading } from '@ragenai/tui/sidebar';
import { Button } from '@ragenai/tui/button';
import { useSidebar } from '@/app/hooks/useSidebar';

import { TUIProjectItem } from './TUIProjectItem';
import { CreateProject } from '../Projects/components/CreateProject';

import type { ProjectsListProps } from '../Projects/types';

export const TUIProjectsList = ({
  projects,
  setIsCreateModalOpen,
  activeThread,
  isCreateModalOpen,
  isLoading,
  refreshProjects,
}: ProjectsListProps) => {
  const t = useTranslations('sidebar.projects');
  const { closeSidebar } = useSidebar();

  return (
    <>
      <SidebarSection>
        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400 dark:border-zinc-600"></div>
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <SidebarHeading className="text-gray-600 dark:text-gray-100 font-bold">
              {t('title')}
            </SidebarHeading>
            <Button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              plain
              className="p-1  hover:bg-gray-200 dark:hover:bg-accent-dark-500 rounded-lg transition-colors cursor-pointer"
              aria-label={t('create-project')}
            >
              {projects.length > 0 ? (
                <PlusIcon className="w-4 h-4" />
              ) : (
                <FolderPlusIcon className="w-6 h-6" />
              )}
            </Button>
          </div>

          <div className="space-y-1 mt-2">
            {(() => {
              if (projects.length > 0) {
                return projects.map((project) => (
                  <TUIProjectItem
                    key={project.publicId}
                    project={project}
                    activeThread={activeThread}
                    onSidebarClose={closeSidebar}
                  />
                ));
              }
              if (!isLoading) {
                return (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                    <FolderPlusIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('no-projects')}</p>
                    <p className="text-xs mt-1">
                      {t('no-projects-description')}
                    </p>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </SidebarSection>

      {isCreateModalOpen && (
        <CreateProject
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
          }}
          refreshProjects={refreshProjects}
        />
      )}
    </>
  );
};
