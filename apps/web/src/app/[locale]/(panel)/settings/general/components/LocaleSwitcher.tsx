'use client';

import { useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { locales, type Locale } from '@/app/config';
import { Listbox, ListboxOption } from '@ragenai/tui/listbox';

const localeNames: Record<Locale, string> = {
  en: 'English',
  pl: 'Polski',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  function onChange(nextLocale: Locale) {
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- TypeScript validates known params per pathname; this is next-intl's documented pattern for locale switching from a client component.
        { pathname, params },
        { locale: nextLocale },
      );
    });
  }

  return (
    <Listbox
      aria-label="Language"
      value={locale as Locale}
      onChange={onChange}
      className="max-w-xs"
    >
      {locales.map((value) => (
        <ListboxOption key={value} value={value}>
          {localeNames[value]}
        </ListboxOption>
      ))}
    </Listbox>
  );
}
