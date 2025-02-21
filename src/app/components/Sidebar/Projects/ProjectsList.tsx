import { useTranslations } from 'next-intl';
import { PlusIcon, SidebarLabel } from '@ragenai/common-ui';
import { ThreadCommunicationType } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { logger } from '@/app/lib/utils/logger';
import { useSidebar } from '@/app/hooks/useSidebar';
import { EmptyProjectsState } from './components/EmptyProjectsState';
import { ProjectItem } from './components/ProjectItem';
import { createThreadAction } from '@/app/lib/actions/threads';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addThread } from '@/store/threads/threadsSlice';
import { ThreadHistoryResponse } from '@/app/contracts/Message';

import type { ProjectsListProps, ThreadType } from './types';
import { CreateProject } from './components/CreateProject';

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
  const { userThreads } = useAppSelector((state) => state.threads);

  const projectsWithUpdatedThreads = projects?.map((project) => {
    const projectThreads = userThreads.filter(
      (thread: ThreadHistoryResponse) =>
        project.threads.some((pt) => pt.public_id === thread.public_id) ||
        thread.project_id === project.id
    );

    const updatedThreads = projectThreads.map(
      (thread: ThreadHistoryResponse) => {
        const existingThread = project.threads.find(
          (pt) => pt.public_id === thread.public_id
        );

        const threadType: ThreadType = {
          ...existingThread,
          public_id: thread.public_id,
          created_at: thread.created_at,
          messages: thread.messages.map((msg: { content: string }) => ({
            content: msg.content,
          })),
          project_id: project.id,
          id: existingThread?.id || thread.public_id,
          visitor_id: existingThread?.visitor_id || null,
          preferred_communication_type:
            existingThread?.preferred_communication_type ||
            ThreadCommunicationType.TEXT,
        };

        return threadType;
      }
    );

    return {
      ...project,
      threads: updatedThreads,
    };
  });

  const handleProjectClick = async (projectPublicId: string) => {
    try {
      const project = projectsWithUpdatedThreads?.find(
        (p) => p.public_id === projectPublicId
      );
      if (!project) return;

      const result = await createThreadAction(project.id);
      if (result.success) {
        dispatch(
          addThread({
            public_id: result.thread.public_id,
            project_id: project.id,
            messages: [],
            created_at: new Date(),
          })
        );

        router.push(
          `/projects/${project.public_id}/threads/${result.thread.public_id}`
        );
        closeSidebar();
      }
    } catch (error) {
      logger.error('Error creating thread for project:', {
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
