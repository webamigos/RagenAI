import { notFound } from 'next/navigation';
import { Assistant } from '@/app/components/Assistant';

type Props = {
  params: Promise<{
    projectId: string;
    threadId: string;
  }>;
};

export default async function ProjectThreadPage({ params }: Props) {
  const { projectId, threadId } = await params;
  return <Assistant threadId={threadId} />;
}
