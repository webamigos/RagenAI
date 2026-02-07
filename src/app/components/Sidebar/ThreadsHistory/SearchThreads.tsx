import React, { useReducer, useRef, useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useTranslations } from 'next-intl';

import { Input } from '@ragenai/tui/input';
import { Text } from '@ragenai/tui/text';
import { SidebarItem } from '@ragenai/tui/sidebar';
import { Dialog, DialogTitle, DialogBody } from '@ragenai/tui/dialog';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchThreadSuggestions } from '../../../actions';
import { reducer, initialState } from './SearchThreadsReducer';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
type SearchThreadsProps = {
  visitorId: string;
};

export const SearchThreads = React.forwardRef<
  HTMLDivElement,
  SearchThreadsProps
>(({ visitorId }, ref) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { query, results, suggestions, isLoading, hasSearched } = state;
  const { closeSearch, isSearchOpen } = useSearchThreads();

  const { errorToast } = statusToast();
  const t = useTranslations('search-threads');

  const inputRef = useRef<HTMLInputElement | null>(null);

  const debouncedFetchSuggestions = useDebouncedCallback(
    async (value: string) => {
      if (value.trim()) {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_HAS_SEARCHED', payload: true });
        try {
          const fetchedSuggestions = await fetchThreadSuggestions(
            visitorId,
            value
          );
          dispatch({ type: 'SET_SUGGESTIONS', payload: fetchedSuggestions });
        } catch (error) {
          errorToast({ message: `${t('error-suggestions')}: ${error}` });
        } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } else {
        dispatch({ type: 'SET_SUGGESTIONS', payload: [] });
        dispatch({ type: 'SET_HAS_SEARCHED', payload: false });
      }
    },
    300
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    dispatch({ type: 'SET_QUERY', payload: value });
    debouncedFetchSuggestions(value);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_HAS_SEARCHED', payload: true });
    try {
      const fetchedResults = await fetchThreadSuggestions(visitorId, query);
      dispatch({
        type: 'SET_RESULTS',
        payload: fetchedResults.map((thread: any) => ({
          id: thread.public_id,
          title: thread.messages[0]?.content,
          createdAt: thread.created_at,
        })),
      });
    } catch (error) {
      errorToast({ message: `${t('error-threads')}: ${error}` });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleSuggestionClick = (suggestionId: string) => {
    if (!suggestionId) {
      errorToast({ message: `${t('threads-not-found')}: ${suggestionId}` });
    }

    dispatch({ type: 'SET_SUGGESTIONS', payload: [] });
    closeSearch();
  };

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  return (
    <Dialog size="lg" open={isSearchOpen} onClose={closeSearch}>
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogBody className="relative h-96 overflow-auto">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm z-10">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400 dark:border-zinc-600"></div>
          </div>
        )}
        <form onSubmit={handleSearch}>
          <Input
            value={query}
            onChange={handleInputChange}
            placeholder={t('placeholder')}
            className="mb-4"
            ref={inputRef}
          />
        </form>
        {suggestions.length > 0 && (
          <div className="mt-2">
            {suggestions.map((suggestion) => (
              <SidebarItem
                key={suggestion.id}
                href={`/threads/${suggestion.id}`}
                onClick={() => handleSuggestionClick(suggestion.id)}
              >
                {suggestion.title}
              </SidebarItem>
            ))}
          </div>
        )}
        <div className="mt-4">
          {hasSearched && results.length === 0 && suggestions.length === 0 && (
            <Text className="text-zinc-500 dark:text-zinc-400">
              {t('no-results')}
            </Text>
          )}
          {results.length > 0 &&
            results.map((thread) => (
              <Text key={thread.id} className="mt-2">
                {thread.title} - {new Date(thread.createdAt).toLocaleString()}
              </Text>
            ))}
        </div>
      </DialogBody>
    </Dialog>
  );
});

SearchThreads.displayName = 'SearchThreads';
