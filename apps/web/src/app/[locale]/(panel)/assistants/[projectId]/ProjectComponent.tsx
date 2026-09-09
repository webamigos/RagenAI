'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  StarIcon as StarIconOutline,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

import { PageSkeleton } from '@ragenai/common-ui/Skeleton';

import { useClientOnly } from '@/app/hooks/useClientOnly';
import { logger } from '@/app/lib/utils/logger';
import { fetchProject } from '@/app/lib/services/api';
import { statusToast } from '@/app/lib/utils/toast';
import { useRouter } from '@/i18n/routing';
import { starProjectAction } from '@/app/components/Sidebar/Projects/actions';

import { ChatInterface } from '@/app/components/ChatInterface';
import { AssistantDropdownMenu } from '@/app/components/Assistants/AssistantDropdownMenu';
import { IntegrationsOnboardingDialog } from '@/app/components/Assistants/IntegrationsOnboardingDialog';
import { ProjectFileUploadTrigger } from '@/app/components/Projects/ProjectFilesManagement/components/ProjectFileUploadTrigger';
import { ProjectInstructionTrigger } from '@/app/components/Projects/ProjectInstructions/ProjectInstructionTrigger';
import { ShareDialogTrigger } from '@/app/components/Projects/ShareDialog/ShareDialogTrigger';

type Project = {
  id: string;
  title: string;
  isPublic: boolean;
  accessToken: string;
  publishedAt: string;
  chatbotEnabled: boolean;
  isStarred: boolean;
  isArchived: boolean;
};

type Props = {
  projectId: string;
};

export function ProjectComponent({ projectId }: Props) {
  const isReady = useClientOnly();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { errorToast } = statusToast();
  const t = useTranslations('projects');
  const tActions = useTranslations('assistant-actions');

  useEffect(() => {
    async function loadProject() {
      try {
        const projectData = await fetchProject(projectId);
        setProject(projectData);
      } catch (error) {
        logger.error('Error loading project:', { error: error });
        errorToast({ message: t('error.fetching-error') });
      } finally {
        setIsLoading(false);
      }
    }

    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (isLoading || !project || !isReady) {
    return <PageSkeleton />;
  }

  const handleStarToggle = async () => {
    const next = !project.isStarred;
    setProject((prev) => (prev ? { ...prev, isStarred: next } : prev));
    const result = await starProjectAction(project.id, next);
    if (!result.success) {
      setProject((prev) => (prev ? { ...prev, isStarred: !next } : prev));
      errorToast({ message: tActions('error-generic') });
    }
  };

  const handleRenamed = (_id: string, title: string) => {
    setProject((prev) => (prev ? { ...prev, title } : prev));
  };

  const handleArchived = (_id: string, isArchived: boolean) => {
    if (isArchived) {
      router.push('/assistants');
      return;
    }
    setProject((prev) => (prev ? { ...prev, isArchived } : prev));
  };

  const handleDeleted = () => {
    router.push('/assistants');
  };

  return (
    <div className="flex flex-col h-screen justify-center items-center gap-4">
      <div className="w-full max-w-3xl mx-auto px-4 -mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-white truncate">
            {project.title}
          </h2>
          <button
            type="button"
            onClick={handleStarToggle}
            aria-label={
              project.isStarred ? tActions('unstar') : tActions('star')
            }
            className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {project.isStarred ? (
              <StarIconSolid className="size-4 text-yellow-500" />
            ) : (
              <StarIconOutline className="size-4 text-zinc-400 dark:text-zinc-500" />
            )}
          </button>
          {project.isArchived && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-300">
              <ArchiveBoxIcon className="size-3" />
              {tActions('archive')}
            </span>
          )}
        </div>
        <AssistantDropdownMenu
          assistant={{
            id: project.id,
            title: project.title,
            isStarred: project.isStarred,
            isArchived: project.isArchived,
          }}
          onStarred={(_id, isStarred) =>
            setProject((prev) => (prev ? { ...prev, isStarred } : prev))
          }
          onRenamed={handleRenamed}
          onArchived={handleArchived}
          onDeleted={handleDeleted}
        />
      </div>

      <IntegrationsOnboardingDialog projectId={project.id} />

      <ChatInterface projectId={project.id} projectTitle={project.title} />

      <div className="w-full flex flex-col md:flex-row md:max-w-[740px] gap-4">
        <div className="flex-1 mx-4 md:mx-0">
          <ProjectFileUploadTrigger projectId={project.id} />
        </div>
        <div className="relative flex-1 mx-4 md:mx-0">
          <ProjectInstructionTrigger projectId={project.id} />
          <div className="absolute cursor-pointer bg-card rounded-md -top-72 md:-top-40 right-0">
            <ShareDialogTrigger
              publishedAt={project.publishedAt}
              accessToken={project.accessToken}
              projectId={project.id}
              isPublicProject={project.isPublic}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
