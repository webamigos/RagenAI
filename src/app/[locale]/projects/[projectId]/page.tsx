import { getProjectByPublicId } from '@/app/lib/services/project';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/app/components';

const NewChatInterface = dynamic(
  () =>
    import('@/app/components/NewChatInterface').then(
      (mod) => mod.NewChatInterface
    ),
  { ssr: false, loading: () => <PageSkeleton /> }
);

// Create a proper placeholder that maintains layout
const ProjectFileUploadPlaceholder = () => (
  <div className="w-full h-[60px] rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"></div>
);

// Improve dynamic import with better loading placeholder
const ProjectFileUploadTrigger = dynamic(
  () =>
    import(
      '../../../components/ManageKnowledge/UploadKnowledge/ProjectFiles/ProjectFileUploadTrigger'
    ).then((mod) => mod.ProjectFileUploadTrigger),
  { ssr: false, loading: () => <ProjectFileUploadPlaceholder /> }
);

const ClientOnlyLayout = dynamic(
  () => import('@/app/components').then((mod) => mod.ClientOnlyLayout),
  { ssr: false, loading: () => <PageSkeleton /> }
);

type Props = {
  params: {
    projectId: string;
  };
};

export default async function ProjectPage({ params }: Props) {
  const project = await getProjectByPublicId(params.projectId);

  if (!project) return null;

  return (
    <ClientOnlyLayout fallback={<PageSkeleton />}>
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
    </ClientOnlyLayout>
  );
}
