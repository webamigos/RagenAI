import { NewChatInterface } from '@/app/components/NewChatInterface';
import { getProjectByPublicId } from '@/app/lib/services/project';

type Props = {
  params: {
    projectId: string;
  };
};

export default async function ProjectPage({ params }: Props) {
  const project = await getProjectByPublicId(params.projectId);
  if (!project) return null;

  return (
    <div className="flex justify-center items-center h-screen">
      <NewChatInterface projectPublicId={params.projectId} />
    </div>
  );
}
