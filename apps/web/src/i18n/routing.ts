import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { defaultLocale, locales } from '@/app/config';

export const routing = defineRouting({
  locales: locales,
  defaultLocale: defaultLocale,
  localePrefix: {
    mode: 'as-needed',
    prefixes: {
      en: '/en',
      pl: '/pl',
      es: '/es',
      de: '/de',
      fr: '/fr',
      pt: '/pt',
      it: '/it',
    },
  },
  // option for i18n in pathnames
  // pathnames: {
  //   '/': '/',
  //   '/organization': {
  //     'en-US': '/organization',
  //     'pl-PL': '/organizacja'
  //   }
  // }
});

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
