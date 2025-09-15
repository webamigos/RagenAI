import { ProjectComponent } from './ProjectComponent';

type Props = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;

  return <ProjectComponent projectId={projectId} />;
}
