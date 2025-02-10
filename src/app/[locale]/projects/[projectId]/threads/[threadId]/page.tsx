import { notFound } from 'next/navigation';
import { Assistant } from '@/app/components/Assistant';

type Props = {
  params: {
    projectId: string;
    threadId: string;
  };
};

export default function ProjectThreadPage({ params }: Props) {
  const projectId = parseInt(params.projectId, 10);

  if (isNaN(projectId)) {
    notFound();
  }

  return <Assistant threadId={params.threadId} />;
}
