'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useTranslations } from 'next-intl';
import { ChatBubbleLeftIcon, FolderIcon } from '@heroicons/react/24/outline';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useRouter } from '@/i18n/routing';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { statusToast } from '@/app/lib/utils/toast';
import { getSidebarThreads } from '../../../actions';
import { searchAll, getRecentProjects } from './search-actions';
import type { SearchResultItem } from '@/features/threads/services/queries/search-all-query';

type SearchThreadsProps = {
  visitorId: string;
};

type TranslateFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function formatRelativeDate(dateStr: string, t: TranslateFn): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return t('date-today');
  }
  if (diffDays === 1) {
    return t('date-yesterday');
  }
  if (diffDays < 7) {
    return t('date-days-ago', { count: diffDays });
  }
  if (diffDays < 30) {
    return t('date-past-week');
  }
  return t('date-past-month');
}

type RecentData = {
  threads: {
    public_id: string;
    title: string | null;
    created_at: string;
    messages: { content: string }[];
  }[];
  projects: { public_id: string; title: string; created_at: string }[];
};

export const SearchThreads = React.forwardRef<
  HTMLDivElement,
  SearchThreadsProps
>(({ visitorId }, _ref) => {
  const { closeSearch, isSearchOpen } = useSearchThreads();
  const router = useRouter();
  const t = useTranslations('search-threads');
  const { errorToast } = statusToast();

  const [query, setQuery] = useState('');
  const [recentData, setRecentData] = useState<RecentData | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRequestIdRef = React.useRef(0);

  // Load recent threads and projects when dialog opens
  useEffect(() => {
    if (!isSearchOpen || !visitorId) {
      return;
    }

    let cancelled = false;

    const loadRecent = async () => {
      try {
        const [threadsResult, projects] = await Promise.all([
          getSidebarThreads(visitorId, 10, 0),
          getRecentProjects(),
        ]);
        if (!cancelled) {
          const seen = new Set<string>();
          const recentThreads = [
            ...threadsResult.starred,
            ...threadsResult.recent,
          ]
            .filter((thread) => {
              if (seen.has(thread.public_id)) {
                return false;
              }
              seen.add(thread.public_id);
              return true;
            })
            .slice(0, 10);
          setRecentData({
            threads: recentThreads as RecentData['threads'],
            projects,
          });
        }
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : String(error);
          errorToast({ message: `${t('error-threads')}: ${msg}` });
        }
      }
    };

    loadRecent();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchOpen, visitorId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isSearchOpen) {
      setQuery('');
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [isSearchOpen]);

  const debouncedSearch = useDebouncedCallback(async (value: string) => {
    if (!value.trim() || value.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    try {
      const results = await searchAll(visitorId, value);
      if (requestId === searchRequestIdRef.current) {
        setSearchResults(results);
      }
    } catch (error) {
      if (requestId === searchRequestIdRef.current) {
        const msg = error instanceof Error ? error.message : String(error);
        errorToast({ message: `${t('error-suggestions')}: ${msg}` });
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  }, 300);

  const handleValueChange = useCallback(
    (value: string) => {
      setQuery(value);
      debouncedSearch(value);
    },
    [debouncedSearch],
  );

  const handleSelect = useCallback(
    (type: 'thread' | 'project', id: string) => {
      closeSearch();
      if (type === 'project') {
        router.push(`/projects/${id}`);
      } else {
        router.push(`/chats/${id}`);
      }
    },
    [closeSearch, router],
  );

  const showRecent = !query.trim();
  const showSearchResults = query.trim().length >= 2;

  return (
    <CommandDialog
      open={isSearchOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSearch();
        }
      }}
      title={t('title')}
      description={t('placeholder')}
      showCloseButton={false}
    >
      <CommandInput
        placeholder={t('placeholder')}
        value={query}
        onValueChange={handleValueChange}
      />
      <CommandList className="max-h-[400px]">
        {isSearching && (
          <div
            className="flex items-center justify-center py-6"
            role="status"
            aria-label={t('loading')}
          >
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-zinc-400 dark:border-zinc-600" />
          </div>
        )}

        {!isSearching && showSearchResults && searchResults.length === 0 && (
          <CommandEmpty>{t('no-results')}</CommandEmpty>
        )}

        {!isSearching && showSearchResults && searchResults.length > 0 && (
          <>
            {searchResults.some((r) => r.type === 'project') && (
              <CommandGroup heading={t('projects')}>
                {searchResults
                  .filter((r) => r.type === 'project')
                  .map((result) => (
                    <CommandItem
                      key={`project-${result.id}`}
                      value={`project-${result.id}-${result.title}`}
                      onSelect={() => handleSelect('project', result.id)}
                      className="cursor-pointer"
                    >
                      <FolderIcon className="size-4 shrink-0 text-zinc-500" />
                      <span className="flex-1 truncate">{result.title}</span>
                      <span className="text-xs text-zinc-400 shrink-0">
                        {formatRelativeDate(result.createdAt, t)}
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
            {searchResults.some((r) => r.type === 'project') &&
              searchResults.some((r) => r.type === 'thread') && (
                <CommandSeparator />
              )}
            {searchResults.some((r) => r.type === 'thread') && (
              <CommandGroup heading={t('threads')}>
                {searchResults
                  .filter((r) => r.type === 'thread')
                  .map((result) => (
                    <CommandItem
                      key={`thread-${result.id}`}
                      value={`thread-${result.id}-${result.title}`}
                      onSelect={() => handleSelect('thread', result.id)}
                      className="cursor-pointer"
                    >
                      <ChatBubbleLeftIcon className="size-4 shrink-0 text-zinc-500" />
                      <span className="flex-1 truncate">{result.title}</span>
                      <span className="text-xs text-zinc-400 shrink-0">
                        {formatRelativeDate(result.createdAt, t)}
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
          </>
        )}

        {!isSearching && showRecent && recentData && (
          <>
            {recentData.projects.length > 0 && (
              <CommandGroup heading={t('projects')}>
                {recentData.projects.map((project) => (
                  <CommandItem
                    key={`recent-project-${project.public_id}`}
                    value={`recent-project-${project.public_id}-${project.title}`}
                    onSelect={() => handleSelect('project', project.public_id)}
                    className="cursor-pointer"
                  >
                    <FolderIcon className="size-4 shrink-0 text-zinc-500" />
                    <span className="flex-1 truncate">{project.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {recentData.threads.length > 0 && (
              <CommandGroup heading={t('recent')}>
                {recentData.threads.map((thread) => (
                  <CommandItem
                    key={`recent-${thread.public_id}`}
                    value={`recent-thread-${thread.public_id}-${thread.title || thread.messages[0]?.content}`}
                    onSelect={() => handleSelect('thread', thread.public_id)}
                    className="cursor-pointer"
                  >
                    <ChatBubbleLeftIcon className="size-4 shrink-0 text-zinc-500" />
                    <span className="flex-1 truncate">
                      {thread.title ||
                        thread.messages[0]?.content?.slice(0, 60) ||
                        t('untitled')}
                    </span>
                    <span className="text-xs text-zinc-400 shrink-0">
                      {formatRelativeDate(thread.created_at, t)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
});

SearchThreads.displayName = 'SearchThreads';
