import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getChatbot, getChatbotThreads } from '../../actions';
import { ChatbotTabs } from '../../components/ChatbotTabs';
import { ConversationsContent } from './ConversationsContent';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ chatbotId: string }>;
};

export default async function ChatbotConversationsPage({ params }: Props) {
  const { chatbotId } = await params;
  const t = await getTranslations('settings-page.chatbots');

  const [chatbot, { threads, hasMore, total }] = await Promise.all([
    getChatbot(chatbotId),
    getChatbotThreads(chatbotId),
  ]);

  if (!chatbot) {
    notFound();
  }

  return (
    <>
      <title>{`${chatbot.name} — ${t('conversations.title')}`}</title>
      <ConversationsContent
        chatbotName={chatbot.name}
        tabs={<ChatbotTabs chatbotId={chatbotId} activeTab="conversations" />}
        initialThreads={threads}
        initialHasMore={hasMore}
        total={total}
        chatbotId={chatbotId}
      />
    </>
  );
}
