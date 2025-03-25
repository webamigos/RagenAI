'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { PageSkeleton } from '@ragenai/common-ui';

import { useClientOnly } from '@/app/hooks/useClientOnly';
import { logger } from '@/app/lib/utils/logger';
import { fetchProject } from '@/app/lib/services/api';
import { statusToast } from '@/app/lib/utils/toast';

import { NewChatInterface } from '@/app/components/NewChatInterface';
import { ProjectFileUploadTrigger } from '@/app/components/Projects/ProjectFilesManagement/components/ProjectFileUploadTrigger';
import { ProjectInstructionTrigger } from '@/app/components/Projects/ProjectInstructions/ProjectInstructionTrigger';
import { ShareDialogTrigger } from '@/app/components/Projects/ShareDialog/ShareDialogTrigger';

type Project = {
  id: number;
  public_id: string;
  title: string;
};

type Props = {
  params: {
    projectId: string;
  };
};

export default function ProjectPage({ params }: Props) {
  const isReady = useClientOnly();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { errorToast } = statusToast();
  const t = useTranslations('projects');

  useEffect(() => {
    async function loadProject() {
      try {
        const projectData = await fetchProject(params.projectId);
        setProject(projectData);
      } catch (error) {
        logger.error('Error loading project:', { error: error });
        errorToast({ message: t('error.fetching-error') });
      } finally {
        setIsLoading(false);
      }
    }

    loadProject();
  }, [params.projectId]);

  if (isLoading || !project || !isReady) {
    return <PageSkeleton />;
  }

  return (
    <div className="flex flex-col h-screen justify-center items-center gap-4">
      <NewChatInterface
        projectId={project.id}
        projectPublicId={project.public_id}
        projectTitle={project.title}
      />

      <div className="w-full flex flex-col md:flex-row md:max-w-[740px] gap-4">
        <div className="flex-1 mx-4 md:mx-0">
          <ProjectFileUploadTrigger
            projectId={project.id}
            projectPublicId={project.public_id}
          />
        </div>
        <div className="relative flex-1 mx-4 md:mx-0">
          <ProjectInstructionTrigger
            projectId={String(project.id)}
            projectPublicId={project.public_id}
          />
          <div className="absolute cursor-pointer bg-white rounded-md -top-72 md:-top-40 right-0">
            <ShareDialogTrigger projectId={project.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
