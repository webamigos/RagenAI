import { ChatInterface } from '@/app/components/Chat';
import { loadThreadMessages } from '@/app/components/Chat/actions';

type Props = {
  params: Promise<{
    projectId: string;
    threadId: string;
  }>;
};

export default async function ProjectThreadPage({ params }: Props) {
  const { threadId } = await params;
  const initialMessages = await loadThreadMessages(threadId);

  return <ChatInterface threadId={threadId} initialMessages={initialMessages} />;
}
