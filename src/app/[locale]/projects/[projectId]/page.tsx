import { getProjectByPublicId } from '@/app/lib/services/project';

import { NewChatInterface } from '@/app/components/NewChatInterface';

import { ProjectFileUploadTrigger } from '../../../components/ManageKnowledge/UploadKnowledge/ProjectFiles/ProjectFileUploadTrigger';

type Props = {
  params: {
    projectId: string;
  };
};

export default async function ProjectPage({ params }: Props) {
  const project = await getProjectByPublicId(params.projectId);

  if (!project) return null;

  return (
    <div className="flex flex-col h-screen justify-center items-center gap-4">
      <NewChatInterface
        projectId={project.id}
        projectPublicId={project.public_id}
        projectTitle={project.title}
      />

      <div className="flex w-full max-w-[740px] gap-4">
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
