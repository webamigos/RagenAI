'use client';

import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useRouter } from '@/i18n/routing';

/**
 * Finds pages by part of their title. A search is part of the URL (`q`), like
 * every Brain filter, and keeps the status and the language it was typed
 * under; Enter searches, the × clears.
 */
export function PageSearch({
  search,
  status,
  language,
}: {
  search: string | null;
  status: string | null;
  language: string | null;
}) {
  const t = useTranslations('brain');
  const router = useRouter();
  const [value, setValue] = useState(search ?? '');

  const go = (q: string) => {
    const params = new URLSearchParams();
    if (status) {
      params.set('status', status);
    }
    if (q.trim()) {
      params.set('q', q.trim());
    }
    if (language) {
      params.set('lang', language);
    }
    const query = params.toString();
    router.push(query ? `/brain?${query}` : '/brain');
  };

  return (
    <form
      role="search"
      className="relative mb-3 w-full max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
    >
      <MagnifyingGlassIcon
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('pages.search-placeholder')}
        aria-label={t('pages.search-placeholder')}
        data-testid="brain-page-search"
        maxLength={200}
        className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {search && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            go('');
          }}
          aria-label={t('pages.search-clear')}
          title={t('pages.search-clear')}
          data-testid="brain-page-search-clear"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
