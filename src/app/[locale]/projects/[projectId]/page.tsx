'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { PageSkeleton } from '@/app/components';
import { useClientOnly } from '@/app/hooks/useClientOnly';
import { logger } from '@/app/lib/utils/logger';
import { fetchProject } from '@/app/lib/services/api';

type Project = {
  id: number;
  public_id: string;
  title: string;
};

const NewChatInterface = dynamic(
  () =>
    import('@/app/components/NewChatInterface').then(
      (mod) => mod.NewChatInterface
    ),
  { ssr: false, loading: () => <PageSkeleton /> }
);

const ProjectFileUploadPlaceholder = () => (
  <div className="w-full h-[60px] rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"></div>
);

const ProjectFileUploadTrigger = dynamic(
  () =>
    import(
      '../../../components/ManageKnowledge/UploadKnowledge/ProjectFiles/ProjectFileUploadTrigger'
    ).then((mod) => mod.ProjectFileUploadTrigger),
  { ssr: false, loading: () => <ProjectFileUploadPlaceholder /> }
);

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
        <div className="flex-1">
          <ProjectFileUploadTrigger
            projectId={project.id}
            projectPublicId={project.public_id}
          />
        </div>
      </div>
    </div>
  );
}
