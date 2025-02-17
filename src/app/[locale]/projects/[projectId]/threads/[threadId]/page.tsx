import { notFound } from 'next/navigation';
import { Assistant } from '@/app/components/Assistant';

type Props = {
  params: {
    projectId: string;
    threadId: string;
  };
};

export default function ProjectThreadPage({ params }: Props) {
  return <Assistant threadId={params.threadId} />;
}
