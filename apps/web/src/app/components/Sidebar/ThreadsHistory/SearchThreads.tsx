'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useTranslations } from 'next-intl';
import {
  ChatBubbleLeftIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  BoltIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { EmptyState } from '@ragenai/common-ui/EmptyState';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useRouter } from '@/i18n/routing';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { statusToast } from '@/app/lib/utils/toast';
import { getSidebarThreadsQuery as getSidebarThreads } from '@/features/threads/services/queries/get-sidebar-threads-query';
import {
  searchAll,
  getRecentProjects,
  searchDocuments,
} from './search-actions';
import type { DocumentSearchResult } from '@/features/documents/services/queries/search-documents-query';
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
    id: string;
    title: string | null;
    createdAt: string;
  }[];
  projects: { id: string; title: string; createdAt: string }[];
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
              if (seen.has(thread.id)) {
                return false;
              }
              seen.add(thread.id);
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

  const [documentResults, setDocumentResults] = useState<
    DocumentSearchResult[]
  >([]);

  const debouncedSearch = useDebouncedCallback(async (value: string) => {
    if (!value.trim() || value.trim().length < 2) {
      // Bump the request id first. Clearing the box while a search is in
      // flight would otherwise let that response land afterwards and
      // repopulate the list someone just emptied — the guard below only
      // rejects responses older than the *newest* id, so the id has to move
      // even when no new search follows.
      searchRequestIdRef.current += 1;
      setSearchResults([]);
      setDocumentResults([]);
      setIsSearching(false);
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setIsSearching(true);

    // Two backends, rendered as each answers rather than when both have.
    // Documents are a local query and threads go through apps/api, so waiting
    // for the pair means the fast half always waits for the slow one.
    const isCurrent = () => requestId === searchRequestIdRef.current;

    const threadsAndProjects = searchAll(visitorId, value).then(
      (results) => {
        if (isCurrent()) {
          setSearchResults(results);
        }
      },
      (error: unknown) => {
        if (isCurrent()) {
          setSearchResults([]);
        }
        throw error;
      },
    );

    const documents = searchDocuments(value).then(
      (results) => {
        if (isCurrent()) {
          setDocumentResults(results);
        }
      },
      (error: unknown) => {
        if (isCurrent()) {
          setDocumentResults([]);
        }
        throw error;
      },
    );

    // Only complain when *both* failed. One backend down still leaves a
    // useful palette, and a toast for a half-working search is noise.
    const outcomes = await Promise.allSettled([threadsAndProjects, documents]);
    if (!isCurrent()) {
      return;
    }
    const allRejected = outcomes.every((o) => o.status === 'rejected');
    if (allRejected) {
      const reason = (outcomes[0] as PromiseRejectedResult).reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      errorToast({ message: `${t('error-suggestions')}: ${msg}` });
    }
    setIsSearching(false);
  }, 300);

  const handleValueChange = useCallback(
    (value: string) => {
      setQuery(value);
      debouncedSearch(value);
    },
    [debouncedSearch],
  );

  const handleSelect = useCallback(
    (type: 'thread' | 'project' | 'document', id: string) => {
      closeSearch();
      if (type === 'project') {
        router.push(`/projects/${id}`);
      } else if (type === 'document') {
        // The list, not a detail route. `/documents/:id` renders a document's
        // own page, and rule 14 of docs/panel-ux-rules.md is that a row has
        // one click target — the knowledge list is where a file is opened.
        router.push('/knowledge/documents-list');
      } else {
        router.push(`/chats/${id}`);
      }
    },
    [closeSearch, router],
  );

  // Places you can go, as opposed to things you have made. cmdk filters these
  // by their `value`, so typing narrows them without a server round-trip.
  const actions = useMemo(
    () => [
      { id: 'new-chat', labelKey: 'action-new-chat', href: '/new' },
      {
        id: 'knowledge',
        labelKey: 'action-knowledge',
        href: '/knowledge/documents-list',
      },
      { id: 'assistants', labelKey: 'action-assistants', href: '/projects' },
      {
        id: 'settings',
        labelKey: 'action-settings',
        href: '/settings/general',
      },
    ],
    [],
  );

  const handleAction = useCallback(
    (href: string) => {
      closeSearch();
      router.push(href);
    },
    [closeSearch, router],
  );

  const handleAsk = useCallback(() => {
    const question = query.trim();
    closeSearch();
    // The palette hands the question to the composer rather than sending it.
    // Choosing a suggestion is not the same as having asked, and the new-chat
    // page is where the scope and the model are still editable.
    router.push(`/new?q=${encodeURIComponent(question)}`);
  }, [closeSearch, router, query]);

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
        {/*
          The spinner means "nothing to show yet", not "a request is open".
          Both searches are in flight at once and settle separately; gating
          the groups on `isSearching` would hold the fast one back until the
          slow one finished, which is the thing this was changed to avoid.
        */}
        {isSearching &&
          searchResults.length === 0 &&
          documentResults.length === 0 && (
            <div
              className="flex items-center justify-center py-6"
              role="status"
              aria-label={t('loading')}
            >
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-border" />
            </div>
          )}

        {!isSearching &&
          showSearchResults &&
          searchResults.length === 0 &&
          documentResults.length === 0 && (
            // Rendered directly rather than through `CommandEmpty`, which
            // only fires when *no* item matches — and the Actions group
            // always matches something now. Through CommandEmpty this state
            // silently disappeared, leaving a search that found nothing
            // looking identical to one nobody had typed into.
            <div>
              <EmptyState
                icon={
                  <MagnifyingGlassIcon className="size-8 text-muted-foreground" />
                }
                title={t('no-results')}
                description={t('no-results-description')}
                className="py-4"
              />
            </div>
          )}

        {/*
          Documents first. The palette's other two groups are things you have
          already made — a thread you wrote, an assistant you configured — and
          a document is the thing people actually go looking for by name.
        */}
        {showSearchResults && documentResults.length > 0 && (
          <>
            <CommandGroup heading={t('documents')}>
              {documentResults.map((document) => (
                <CommandItem
                  key={`document-${document.id}`}
                  value={`document-${document.id}-${document.fileName}`}
                  onSelect={() => handleSelect('document', document.id)}
                  className="cursor-pointer"
                >
                  <DocumentTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{document.fileName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {searchResults.length > 0 && <CommandSeparator />}
          </>
        )}

        {showSearchResults && searchResults.length > 0 && (
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
                      <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{result.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
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
                      <ChatBubbleLeftIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{result.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelativeDate(result.createdAt, t)}
                      </span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
          </>
        )}

        {/*
          Actions are always offered — they are places to go, not results, so
          they do not depend on a search returning anything. cmdk narrows them
          by `value` as you type.
        */}
        <CommandGroup heading={t('actions')}>
          {actions.map((action) => (
            <CommandItem
              key={action.id}
              value={`action-${t(action.labelKey)}`}
              onSelect={() => handleAction(action.href)}
              className="cursor-pointer"
            >
              <BoltIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{t(action.labelKey)}</span>
            </CommandItem>
          ))}
          {showSearchResults ? (
            <CommandItem
              // The value carries the query itself, so cmdk's own filter can
              // never hide this row — whatever someone typed, asking it is
              // always an option, and it is the only one that searches the
              // *contents* of their documents rather than the names.
              value={`ask-${query}`}
              onSelect={handleAsk}
              className="cursor-pointer"
            >
              <SparklesIcon className="size-4 shrink-0 text-primary" />
              <span className="flex-1 truncate">
                {t('ask-about', { query: query.trim() })}
              </span>
            </CommandItem>
          ) : null}
        </CommandGroup>

        {!isSearching && showRecent && recentData && (
          <>
            {recentData.projects.length > 0 && (
              <CommandGroup heading={t('projects')}>
                {recentData.projects.map((project) => (
                  <CommandItem
                    key={`recent-project-${project.id}`}
                    value={`recent-project-${project.id}-${project.title}`}
                    onSelect={() => handleSelect('project', project.id)}
                    className="cursor-pointer"
                  >
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{project.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {recentData.threads.length > 0 && (
              <CommandGroup heading={t('recent')}>
                {recentData.threads.map((thread) => (
                  <CommandItem
                    key={`recent-${thread.id}`}
                    value={`recent-thread-${thread.id}-${thread.title || ''}`}
                    onSelect={() => handleSelect('thread', thread.id)}
                    className="cursor-pointer"
                  >
                    <ChatBubbleLeftIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">
                      {thread.title || t('untitled')}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeDate(thread.createdAt, t)}
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
