'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/20/solid';

import { useUser } from '@/app/hooks/use-auth';
import { Link } from '@/i18n/routing';
import { Button } from '@ragenai/common-ui/Button';
import { getAllThreads } from '@/app/actions';
import { Input } from '@/components/ui/input';
import { ThreadDropdownMenu } from '@/app/components/ThreadDropdownMenu';
import type { AllThreadsItem } from '@/features/threads/contracts/thread.types';
import { logger } from '@/app/lib/utils/logger';
import { formatRelativeTime } from '@/app/lib/utils/format-relative-time';

const PAGE_SIZE = 20;

function getThreadTitle(thread: AllThreadsItem): string {
  return thread.title || 'New conversation';
}

function getThreadHref(thread: AllThreadsItem): string {
  return `/chats/${thread.id}`;
}

export const ChatsPage = () => {
  const t = useTranslations('chats-page');
  const locale = useLocale();
  const { user } = useUser();
  const [threads, setThreads] = useState<AllThreadsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [skip, setSkip] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchThreads = useCallback(
    async (currentSkip: number, query: string, append = false) => {
      if (!user?.id) {
        return;
      }
      setIsLoading(true);
      try {
        const result = await getAllThreads(
          user.id,
          currentSkip,
          PAGE_SIZE,
          query || undefined,
        );
        if (append) {
          setThreads((prev) => [
            ...prev,
            ...(result.threads as AllThreadsItem[]),
          ]);
        } else {
          setThreads(result.threads as AllThreadsItem[]);
        }
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (error) {
        logger.error({ error }, 'Failed to fetch threads');
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (user?.id) {
      fetchThreads(0, searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setSkip(0);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchThreads(0, value);
    }, 300);
  };

  const loadMore = async () => {
    const nextSkip = skip + PAGE_SIZE;
    setSkip(nextSkip);
    await fetchThreads(nextSkip, searchQuery, true);
  };

  const handleToggleStar = (threadId: string, isStarred: boolean) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, isStarred: isStarred } : t)),
    );
  };

  const handleRenamed = (threadId: string, newTitle: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t)),
    );
  };

  const handleDeleted = (threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setTotal((prev) => prev - 1);
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h1>
        <Button href="/new">
          <PlusIcon className="size-4" />
          {t('new-chat')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
        <Input
          type="text"
          placeholder={t('search-placeholder')}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Thread count */}
      {!isLoading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          {t('thread-count', { count: total })}
        </p>
      )}

      {/* Thread list */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className="group flex items-center gap-3 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 -mx-2 px-2 rounded-lg transition-colors"
          >
            <Link href={getThreadHref(thread)} className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-950 dark:text-white truncate">
                {getThreadTitle(thread)}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t('last-message', {
                    time: formatRelativeTime(thread.createdAt, locale),
                  })}
                </span>
                {thread.project && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    in {thread.project.title}
                  </span>
                )}
              </div>
            </Link>
            <ThreadDropdownMenu
              thread={thread}
              onStarred={handleToggleStar}
              onRenamed={handleRenamed}
              onDeleted={handleDeleted}
              triggerClassName="shrink-0 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            />
          </div>
        ))}
      </div>

      {/* Loading */}
      {isLoading && threads.length === 0 && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && threads.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">{t('no-threads')}</p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            {t('no-threads-description')}
          </p>
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {isLoading ? '...' : t('load-more')}
          </button>
        </div>
      )}
    </div>
  );
};
