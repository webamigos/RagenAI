'use client';

import { useState, useEffect } from 'react';

import { PageSkeleton } from '@ragenai/common-ui';

import { useClientOnly } from '@/app/hooks/useClientOnly';
import { logger } from '@/app/lib/utils/logger';
import { fetchProject } from '@/app/lib/services/api';

import { NewChatInterface } from '@/app/components/NewChatInterface';
import { ProjectFileUploadTrigger } from '@/app/components/ManageKnowledge/UploadKnowledge/ProjectFiles/ProjectFileUploadTrigger';

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

  useEffect(() => {
    async function loadProject() {
      try {
        const projectData = await fetchProject(params.projectId);
        setProject(projectData);
      } catch (error) {
        logger.error('Error loading project:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadProject();
  }, [params.projectId]);

  if (isLoading || !project) return <PageSkeleton />;

  if (!isReady) return <PageSkeleton />;

  return (
    <div className="flex flex-col h-screen justify-center items-center gap-4">
      <NewChatInterface
        projectId={project.id}
        projectPublicId={project.public_id}
        projectTitle={project.title}
      />

      <div className="flex w-full max-w-[740px] gap-4 flex-col">
        <div className="flex-1 mx-4 md:mx-0">
          <ProjectFileUploadTrigger
            projectId={project.id}
            projectPublicId={project.public_id}
          />
        </div>
      </div>
    </div>
  );
}
