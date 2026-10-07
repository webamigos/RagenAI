'use client';

import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { BRAIN_LANGUAGE_NONE } from '@/features/brain/contracts/brain-language.types';
import { languageName } from '@/features/brain/utils/language-name';
import { usePathname, useRouter } from '@/i18n/routing';

/**
 * Narrows every Brain tab to the documents in one language (`?lang=`), or to
 * those whose language was not detected. All languages by default. Offered
 * only when there is a choice to make — one language, or none detected, is
 * nothing to filter.
 */
export function LanguageFilter({
  languages,
}: {
  languages: { language: string | null; documents: number }[];
}) {
  const t = useTranslations('brain');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('lang') ?? '';

  if (languages.length < 2) {
    return null;
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {t('language.label')}
      <span className="relative">
        <select
          value={current}
          data-testid="brain-language-filter"
          onChange={(e) => {
            const params = new URLSearchParams(searchParams.toString());
            if (e.target.value) {
              params.set('lang', e.target.value);
            } else {
              params.delete('lang');
            }
            // A list's page and a picked item belong to the old selection.
            params.delete('page');
            params.delete('selected');
            params.delete('finding');
            const query = params.toString();
            router.push(query ? `${pathname}?${query}` : pathname);
          }}
          className="h-9 appearance-none rounded-md border border-border bg-card py-1 pr-9 pl-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">{t('language.all')}</option>
          {languages.map(({ language, documents }) => (
            <option
              key={language ?? BRAIN_LANGUAGE_NONE}
              value={language ?? BRAIN_LANGUAGE_NONE}
            >
              {t('language.option', {
                name: language
                  ? languageName(language, locale)
                  : t('language.none'),
                count: documents,
              })}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </label>
  );
}
