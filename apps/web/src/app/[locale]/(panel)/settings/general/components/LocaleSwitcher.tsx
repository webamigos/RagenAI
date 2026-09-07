'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { locales, type Locale } from '@/app/config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const localeNames: Record<Locale, string> = {
  en: 'English',
  pl: 'Polski',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
  hu: 'Magyar',
  bg: 'Български',
  uk: 'Українська',
  da: 'Dansk',
  sv: 'Svenska',
  fi: 'Suomi',
  cs: 'Čeština',
  sk: 'Slovenčina',
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('settings-page.general');
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
    <Select
      value={locale as Locale}
      onValueChange={(value) => onChange(value as Locale)}
    >
      <SelectTrigger aria-label={t('language')} className="max-w-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((value) => (
          <SelectItem key={value} value={value}>
            {localeNames[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
