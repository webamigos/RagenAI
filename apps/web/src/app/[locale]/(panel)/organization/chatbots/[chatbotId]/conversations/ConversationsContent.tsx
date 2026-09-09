'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Link } from '@/i18n/routing';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import { getChatbotThreads } from '../../actions';
import type { getChatbotThreadsQuery } from '@/features/chatbots/services/queries/get-chatbot-threads-query';
import { ConversationRow } from './ConversationRow';
import { EmptyState } from './EmptyState';

type Thread = Awaited<
  ReturnType<typeof getChatbotThreadsQuery>
>['threads'][number];

type Props = {
  chatbotName: string;
  tabs: ReactNode;
  initialThreads: Thread[];
  initialHasMore: boolean;
  total: number;
  chatbotId: string;
};

export function ConversationsContent({
  chatbotName,
  tabs,
  initialThreads,
  initialHasMore,
  total,
  chatbotId,
}: Props) {
  const t = useTranslations('settings-page.chatbots');
  const { errorToast } = statusToast();

  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoadMore = async () => {
    setIsLoading(true);
    try {
      const result = await getChatbotThreads(chatbotId, threads.length);
      setThreads((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const newThreads = result.threads.filter((t) => !existingIds.has(t.id));
        return [...prev, ...newThreads];
      });
      setHasMore(result.hasMore);
    } catch (err) {
      logger.error({ err }, 'Failed to load more conversations');
      errorToast({ message: t('conversations.load-more-error') });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/organization/chatbots"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-muted-foreground/90 hover:bg-muted transition-colors"
            >
              <ArrowLeftIcon className="size-4" />
            </Link>
            <h2 className="text-base font-semibold text-foreground">
              {chatbotName}
            </h2>
          </div>
          {total > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {total}
            </span>
          )}
        </div>
        {tabs}
      </div>

      {threads.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted dark:bg-card/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('conversations.session-id')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                  {t('conversations.first-message')}
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide w-20 hidden md:table-cell">
                  {t('conversations.messages-count')}
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide w-32">
                  {t('conversations.started-at')}
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {threads.map((thread) => (
                <ConversationRow
                  key={thread.id}
                  thread={thread}
                  chatbotId={chatbotId}
                />
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoading}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {isLoading
                  ? t('conversations.loading')
                  : t('conversations.load-more')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
