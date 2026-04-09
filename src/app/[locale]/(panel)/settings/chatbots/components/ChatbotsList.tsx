'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ChatbotCard } from './ChatbotCard';
import { CreateChatbotButton } from './CreateChatbotButton';
import type { getChatbotsQuery } from '@/features/chatbots/services/queries/get-chatbots-query';

type Chatbot = Awaited<ReturnType<typeof getChatbotsQuery>>[number];

type ChatbotsListProps = {
  chatbots: Chatbot[];
};

export function ChatbotsList({ chatbots }: ChatbotsListProps) {
  const t = useTranslations('settings-page.chatbots');
  const router = useRouter();

  const handleCreated = () => {
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {chatbots.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('no-chatbots')}
        </p>
      )}
      {chatbots.map((chatbot) => (
        <ChatbotCard key={chatbot.id} chatbot={chatbot} />
      ))}
      <CreateChatbotButton onCreated={handleCreated} />
    </div>
  );
}
