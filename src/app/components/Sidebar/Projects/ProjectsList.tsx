'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { PlusIcon, SidebarLabel } from '@ragenai/common-ui';
import { useSidebar } from '@/app/hooks/useSidebar';
import { useAppDispatch } from '@/store/hooks';

import { createThreadAction } from '@/app/lib/actions/threads';
import { addThread } from '@/store/threads/threadsSlice';

import { logger } from '@/app/lib/utils/logger';

import { EmptyProjectsState } from './components/EmptyProjectsState';
import { ProjectItem } from './components/ProjectItem';
import { CreateProject } from './components/CreateProject';

import type { ProjectsListProps, ThreadType } from './types';

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
  const router = useRouter();
  const dispatch = useAppDispatch();

  const projectsWithUpdatedThreads =
    projects?.map((project) => {
      const updatedThreads = project.threads.map((thread: ThreadType) => ({
        ...thread,
        messages: thread.messages.map((msg) => ({
          content: msg.content,
          role: 'user' as const,
          created_at: new Date(),
        })),
      }));

      return {
        ...project,
        threads: updatedThreads,
      };
    }) || [];

  const handleProjectClick = async (projectPublicId: string) => {
    try {
      const project = projectsWithUpdatedThreads.find(
        (p) => p.public_id === projectPublicId
      );
      if (!project) return;

      router.push(`/projects/${project.public_id}`);
      closeSidebar();
    } catch (error) {
      logger.error('Error navigating to project:', {
        projectPublicId,
        error,
      });
    }
  };

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
        {!projectsWithUpdatedThreads.length ? (
          <EmptyProjectsState
            isLoading={isLoading}
            onCreateClick={() => setIsCreateModalOpen(true)}
          />
        ) : (
          <div className="space-y-1 mt-2">
            {projectsWithUpdatedThreads.map((project) => (
              <ProjectItem
                key={project.public_id}
                project={project}
                activeThread={activeThread}
                onProjectClick={handleProjectClick}
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
