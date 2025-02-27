import { getProjectByPublicId } from '@/app/lib/services/project';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/app/components';

// Dynamiczny import komponentów z wyłączonym SSR
const NewChatInterface = dynamic(
  () =>
    import('@/app/components/NewChatInterface').then(
      (mod) => mod.NewChatInterface
    ),
  { ssr: false, loading: () => <PageSkeleton /> }
);

const ProjectFileUploadTrigger = dynamic(
  () =>
    import(
      '../../../components/ManageKnowledge/UploadKnowledge/ProjectFiles/ProjectFileUploadTrigger'
    ).then((mod) => mod.ProjectFileUploadTrigger),
  { ssr: false, loading: () => <PageSkeleton /> }
);

const ProjectFilesList = dynamic(
  () =>
    import(
      '../../../components/ManageKnowledge/UploadKnowledge/ProjectFiles/ProjectFilesList'
    ).then((mod) => mod.ProjectFilesList),
  { ssr: false, loading: () => <PageSkeleton /> }
);

// Dynamiczny import komponentu client-side
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
          <div className="flex-1">
            <ProjectFilesList projectId={project.id} />
          </div>
        </div>
      </div>
    </ClientOnlyLayout>
  );
}
