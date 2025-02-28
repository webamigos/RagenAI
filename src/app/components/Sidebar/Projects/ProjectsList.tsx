'use client';

import { useTranslations } from 'next-intl';

import { PlusIcon, SidebarLabel } from '@ragenai/common-ui';
import { useSidebar } from '@/app/hooks/useSidebar';

import { EmptyProjectsState } from './components/EmptyProjectsState';
import { ProjectItem } from './components/ProjectItem';
import { CreateProject } from './components/CreateProject';

import type { ProjectsListProps } from './types';

export const ProjectsList = ({
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
      <div className="mb-4">
        <div className="w-full flex items-center justify-between">
          <SidebarLabel className="p-2 text-gray-600 dark:text-gray-100 font-bold">
            {t('title')}
          </SidebarLabel>
          {projects.length > 0 && (
            <div
              onClick={() => setIsCreateModalOpen(true)}
              className="p-1 mr-4 hover:bg-gray-200 dark:hover:bg-accent-dark-500 rounded-lg transition-colors cursor-pointer"
            >
              <PlusIcon className="w-4 h-4" />
            </div>
          )}
        </div>
        {!projects.length ? (
          <EmptyProjectsState
            isLoading={isLoading}
            onCreateClick={() => setIsCreateModalOpen(true)}
          />
        ) : (
          <div className="space-y-1 mt-2">
            {projects.map((project) => (
              <ProjectItem
                key={project.public_id}
                project={project}
                activeThread={activeThread}
                onSidebarClose={closeSidebar}
              />
            ))}
          </div>
        )}
      </div>
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
