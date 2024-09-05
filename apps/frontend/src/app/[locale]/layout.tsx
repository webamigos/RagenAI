import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { plPL, enUS } from '@clerk/localizations';

import { Providers } from '../components/Providers';
import { ThreadsContextProvider } from '../../context/ThreadsContext';
import { locales } from '../config';
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

  return (
    <ClerkProvider localization={locale === 'pl' ? plPL : enUS}>
      <html lang={locale} className="h-full" suppressHydrationWarning>
        <body className={`${inter.className} h-full`}>
          <ThreadsContextProvider>
            <Providers>{children}</Providers>
          </ThreadsContextProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
