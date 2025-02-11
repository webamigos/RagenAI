import { useTranslations } from 'next-intl';
import { PlusIcon, SidebarLabel } from '@ragenai/common-ui';
import { ThreadCommunicationType } from '@prisma/client';

import { useNewThread } from '@/app/hooks/useNewThread';
import { logger } from '@/app/lib/utils/logger';
import { useSidebar } from '@/app/hooks/useSidebar';
import { EmptyProjectsState } from './components/EmptyProjectsState';
import { ProjectItem } from './components/ProjectItem';
import { useThreadsContext } from '@/app/hooks/useThreadsContext';

import type { ProjectsListProps, ThreadType } from './types';
import { CreateProject } from './components/CreateProject';

export const ProjectsList = ({
  projects,
  setIsCreateModalOpen,
  activeThread,
  isCreateModalOpen,
  isLoading,
}: ProjectsListProps) => {
  const t = useTranslations('sidebar.projects');
  const { handleNewThread } = useNewThread();
  const { closeSidebar } = useSidebar();
  const {
    state: { userThreads },
  } = useThreadsContext();

  const projectsWithUpdatedThreads = projects.map((project) => {
    const projectThreads = userThreads.filter(
      (thread) =>
        project.threads.some((pt) => pt.public_id === thread.public_id) ||
        thread.project_id === project.id
    );

    const updatedThreads = projectThreads.map((thread) => {
      const existingThread = project.threads.find(
        (pt) => pt.public_id === thread.public_id
      );

      const threadType: ThreadType = {
        ...existingThread,
        public_id: thread.public_id,
        created_at: thread.created_at,
        messages: thread.messages.map((msg) => ({ content: msg.content })),
        project_id: project.id,
        id: existingThread?.id || thread.public_id,
        openai_thread_id: existingThread?.openai_thread_id || thread.public_id,
        visitor_id: existingThread?.visitor_id || null,
        preferred_communication_type:
          existingThread?.preferred_communication_type ||
          ThreadCommunicationType.TEXT,
      };

      return threadType;
    });

    return {
      ...project,
      threads: updatedThreads,
    };
  });

  const handleProjectClick = async (projectId: number) => {
    try {
      await handleNewThread(projectId);
    } catch (error) {
      logger.error('Error creating thread for project:', { projectId, error });
    }
  };

  return (
    <>
      <div className="mb-4">
        <div className="w-full flex items-center justify-between">
          <SidebarLabel className="p-2 text-gray-600 dark:text-gray-100 font-bold">
            {t('title')}
          </SidebarLabel>
          <div
            onClick={() => setIsCreateModalOpen(true)}
            className="p-1 mr-4 hover:bg-gray-200 dark:hover:bg-accent-dark-500 rounded-lg transition-colors cursor-pointer"
          >
            <PlusIcon className="w-4 h-4" />
          </div>
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
        />
      )}
    </>
  );
};
