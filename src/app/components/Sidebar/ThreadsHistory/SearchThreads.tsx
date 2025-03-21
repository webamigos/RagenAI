import React, { useReducer, useRef, useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useTranslations } from 'next-intl';

import {
  Input,
  Text,
  SpinnerSVG,
  SidebarItem,
  Dialog,
  DialogTitle,
} from '@ragenai/common-ui';
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
>(({ visitorId }) => {
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
    <Dialog
      onClick={(e) => e.stopPropagation()}
      size="lg"
      className="h-96 p-4 overflow-auto"
      open={isSearchOpen}
      onClose={closeSearch}
    >
      <DialogTitle>{t('title')}</DialogTitle>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-opacity-50 z-10">
          <SpinnerSVG size="lg" />
        </div>
      )}
      <form onSubmit={handleSearch}>
        <Input
          value={query}
          onChange={handleInputChange}
          placeholder={t('placeholder')}
          className="py-2 mb-4"
          ref={inputRef}
        />
      </form>
      {suggestions.length > 0 && (
        <div className="mt-2">
          {suggestions.map((suggestion) => (
            <SidebarItem
              key={suggestion.id}
              hasIcon
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
          <Text className="text-gray-500">{t('no-results')}</Text>
        )}
        {results.length > 0 &&
          results.map((thread) => (
            <Text key={thread.id} className="mt-2">
              {thread.title} - {new Date(thread.createdAt).toLocaleString()}
            </Text>
          ))}
      </div>
    </Dialog>
  );
});

SearchThreads.displayName = 'SearchThreads';
