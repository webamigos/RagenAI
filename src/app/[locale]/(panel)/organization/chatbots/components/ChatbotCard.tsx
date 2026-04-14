'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Button } from '@ragenai/common-ui/Button';
import { Badge } from '@ragenai/tui/badge';
import { PencilIcon } from '@heroicons/react/24/outline';
import type { getChatbotsQuery } from '@/features/chatbots/services/queries/get-chatbots-query';

type Chatbot = Awaited<ReturnType<typeof getChatbotsQuery>>[number];

type ChatbotCardProps = {
  chatbot: Chatbot;
};

export function ChatbotCard({ chatbot }: ChatbotCardProps) {
  const t = useTranslations('settings-page.chatbots');
  const router = useRouter();

  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
            {chatbot.name}
          </h3>
          <Badge color={chatbot.isActive ? 'green' : 'zinc'}>
            {chatbot.isActive ? t('active') : t('inactive')}
          </Badge>
        </div>
        {chatbot.selectedFileIds.length > 0 && (
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {t('files-count', { count: chatbot.selectedFileIds.length })}
          </p>
        )}
      </div>
      <Button
        outline
        onClick={() => router.push(`/organization/chatbots/${chatbot.id}`)}
      >
        <PencilIcon className="size-4" />
        {t('edit')}
      </Button>
    </div>
  );
}
