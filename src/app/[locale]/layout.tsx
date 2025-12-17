import { getMessages, setRequestLocale } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { enUS } from '@clerk/localizations';
import { NextIntlClientProvider } from 'next-intl';
import dynamic from 'next/dynamic';
import { GoogleTagManager } from '@next/third-parties/google';

import { Providers } from '../components/Providers';
import { plPL } from '../messages/pl-PL-clerk';
import { timezone } from '../config';
import './global.css';
import { Inter } from 'next/font/google';
import { SettingsProvider } from '@/context/AssistantSettingsContext';
import { isProductionTargetEnv } from '@/libs/utils/env';
import { SearchThreadsProvider } from '@/context/SearchThreadsContext';
import { routing } from '@/i18n/routing';
import { notFound } from 'next/navigation';

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

const interFont = Inter({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800'],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: Props) {
  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider timeZone={timezone} messages={messages}>
      <ClerkProvider localization={locale === 'pl' ? plPL : enUS}>
        <html lang={locale} className="h-full" suppressHydrationWarning>
          {isProductionTargetEnv && <GoogleTagManager gtmId="GTM-MPJ4T77X" />}
          <body className={`${interFont.className} h-full`}>
            <Providers>
              <SearchThreadsProvider>
                <SettingsProvider>
                  <JoyrideProvider>{children}</JoyrideProvider>
                </SettingsProvider>
              </SearchThreadsProvider>
            </Providers>
          </body>
        </html>
      </ClerkProvider>
    </NextIntlClientProvider>
  );
}
