'use client';

import { useTranslations } from 'next-intl';
import { PlusIcon, FolderPlusIcon } from '@heroicons/react/20/solid';

import { SidebarSection, SidebarHeading } from '@ragenai/tui/sidebar';
import { Button } from '@ragenai/tui/button';
import { EmptyState } from '@ragenai/tui/empty-state';
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
                    key={project.id}
                    project={project}
                    activeThread={activeThread}
                  />
                ));
              }
              if (!isLoading) {
                return (
                  <EmptyState
                    icon={
                      <FolderPlusIcon className="size-8 text-zinc-400 dark:text-zinc-500" />
                    }
                    title={t('no-projects')}
                    description={t('no-projects-description')}
                    className="py-4"
                  />
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
