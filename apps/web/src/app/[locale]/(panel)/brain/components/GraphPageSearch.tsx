'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/routing';
import { withLanguage } from '@/features/brain/utils/with-language';
/** All scoped titles are searchable, including pages outside the canvas budget. */
export function GraphPageSearch({
  pages,
  language,
}: {
  pages: { id: string; title: string }[];
  language: string | null;
}) {
  const t = useTranslations('brain.graph');
  const [query, setQuery] = useState('');
  const matches = query.trim()
    ? pages.filter((page) =>
        page.title
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      )
    : [];
  return (
    <div className="mb-4 max-w-md" role="search">
      <Input
        type="search"
        value={query}
        maxLength={200}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t('search-all-pages')}
        placeholder={t('search-all-pages')}
      />
      {query.trim() && (
        <div className="mt-2 rounded-md border bg-card p-2">
          <p className="mb-1 text-xs text-muted-foreground">
            {t('search-results-count', {
              count: matches.length,
              shown: Math.min(matches.length, 20),
            })}
          </p>
          <ul>
            {matches.slice(0, 20).map((page) => (
              <li key={page.id}>
                <Link
                  className="block min-h-8 rounded px-2 py-1 text-sm text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  href={withLanguage(
                    `/brain/graph?view=neighbourhood&focus=${page.id}`,
                    language,
                  )}
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
