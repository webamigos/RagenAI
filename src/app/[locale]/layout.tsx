import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { enUS } from '@clerk/localizations';
import { NextIntlClientProvider, useMessages } from 'next-intl';

import { Providers } from '../components/Providers';
import { ThreadsContextProvider } from '../../context/ThreadsContext';
import { plPL } from '../messages/pl-PL-clerk';
import { locales, timezone } from '../config';
import './global.css';

import { Inter } from 'next/font/google';

type Props = {
  children: React.ReactNode;
  params: {
    locale: string;
  };
};

const inter = Inter({ subsets: ['latin'] });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default function LocaleLayout({ children, params: { locale } }: Props) {
  setRequestLocale(locale);
  const messages = useMessages();

  return (
    <NextIntlClientProvider timeZone={timezone} messages={messages}>
      <ClerkProvider localization={locale === 'pl' ? plPL : enUS}>
        <html lang={locale} className="h-full" suppressHydrationWarning>
          <body className={`${inter.className} h-full`}>
            <ThreadsContextProvider>
              <Providers>{children}</Providers>
            </ThreadsContextProvider>
          </body>
        </html>
      </ClerkProvider>
    </NextIntlClientProvider>
  );
}
