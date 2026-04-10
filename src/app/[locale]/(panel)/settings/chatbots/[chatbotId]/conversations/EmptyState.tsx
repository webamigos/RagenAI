'use client';

import { useTranslations } from 'next-intl';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

export function EmptyState() {
  const t = useTranslations('settings-page.chatbots');

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-6 py-12 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <ChatBubbleLeftRightIcon className="size-5 text-zinc-400 dark:text-zinc-500" />
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {t('conversations.no-conversations')}
      </p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        {t('conversations.no-conversations-description')}
      </p>
    </div>
  );
}
