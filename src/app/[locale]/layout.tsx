import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { enUS } from '@clerk/localizations';
import { NextIntlClientProvider, useMessages } from 'next-intl';
import dynamic from 'next/dynamic';
import { GoogleTagManager } from '@next/third-parties/google';

import { Providers } from '../components/Providers';
import { ThreadsContextProvider } from '../../context/ThreadsContext';
import { plPL } from '../messages/pl-PL-clerk';
import { locales, timezone } from '../config';
import './global.css';
import { Inter } from 'next/font/google';
import { SidebarProvider } from '@/context/SidebarContext';

const JoyrideProvider = dynamic<JoyrideProviderProps>(
  () =>
    import('@/context/OnboardingContext').then((mod) => mod.JoyrideProvider),
  {
    ssr: false,
  }
);

type JoyrideProviderProps = {
  children: React.ReactNode;
};

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
          <GoogleTagManager gtmId="GTM-MPJ4T77X" />
          <body className={`${inter.className} h-full`}>
            <ThreadsContextProvider>
              <Providers>
                <SidebarProvider>
                  <JoyrideProvider>{children}</JoyrideProvider>
                </SidebarProvider>
              </Providers>
            </ThreadsContextProvider>
          </body>
        </html>
      </ClerkProvider>
    </NextIntlClientProvider>
  );
}
