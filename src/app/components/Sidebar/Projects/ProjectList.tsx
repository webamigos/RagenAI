import { useTranslations } from 'next-intl';
import { SidebarLabel } from '@ragenai/common-ui';
import { ThreadCommunicationType } from '@prisma/client';

import { useNewThread } from '@/app/hooks/useNewThread';
import { logger } from '@/app/lib/utils/logger';
import { useSidebar } from '@/app/hooks/useSidebar';
import { EmptyProjectsState } from './components/EmptyProjectsState';
import { ProjectItem } from './components/ProjectItem';
import { useThreadsContext } from '@/app/hooks/useThreadsContext';

import type { ProjectsListProps, ThreadType } from './types';

export const ProjectsList = ({
  projects,
  setIsCreateModalOpen,
  activeThread,
}: ProjectsListProps) => {
  const t = useTranslations('sidebar.projects');
  const { handleNewThread } = useNewThread();
  const { closeSidebar } = useSidebar();
  const {
    state: { userThreads },
  } = useThreadsContext();

  const projectsWithUpdatedThreads = projects.map((project) => {
    // Get all threads that belong to this project (including new ones)
    const projectThreads = userThreads.filter(
      (thread) =>
        // Match existing project threads
        project.threads.some((pt) => pt.public_id === thread.public_id) ||
        // Or match threads that were newly created for this project
        thread.project_id === project.id
    );

    // Map threads to maintain the correct ThreadType structure
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
        // Use existing thread values or defaults for required ThreadType fields
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
    <div className="mb-4">
      <SidebarLabel className="text-gray-600 dark:text-gray-100 font-bold p-2">
        {t('title')}
      </SidebarLabel>
      {!projectsWithUpdatedThreads.length ? (
        <EmptyProjectsState onCreateClick={() => setIsCreateModalOpen(true)} />
      ) : (
        <div className="space-y-1">
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
  );
};
