'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { ChatbotCard } from './ChatbotCard';
import { CreateChatbotButton } from './CreateChatbotButton';
import type { getChatbotsQuery } from '@/features/chatbots/services/queries/get-chatbots-query';

type Chatbot = Awaited<ReturnType<typeof getChatbotsQuery>>[number];

type ChatbotsListProps = {
  chatbots: Chatbot[];
  title: string;
  description: string;
};

export function ChatbotsList({
  chatbots,
  title,
  description,
}: ChatbotsListProps) {
  const t = useTranslations('settings-page.chatbots');
  const router = useRouter();

  const handleCreated = () => {
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <CreateChatbotButton onCreated={handleCreated} />
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3">
        {chatbots.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('no-chatbots')}</p>
        )}
        {chatbots.map((chatbot) => (
          <ChatbotCard key={chatbot.id} chatbot={chatbot} />
        ))}
      </div>
    </div>
  );
}
