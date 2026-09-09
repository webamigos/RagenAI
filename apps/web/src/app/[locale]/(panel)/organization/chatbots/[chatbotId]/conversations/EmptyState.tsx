'use client';

import { useTranslations } from 'next-intl';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

export function EmptyState() {
  const t = useTranslations('settings-page.chatbots');

  return (
    <div className="rounded-lg border border-border px-6 py-12 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
        <ChatBubbleLeftRightIcon className="size-5 text-muted-foreground" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        {t('conversations.no-conversations')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('conversations.no-conversations-description')}
      </p>
    </div>
  );
}
