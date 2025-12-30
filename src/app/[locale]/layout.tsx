import { getMessages, setRequestLocale } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import dynamic from 'next/dynamic';
import { GoogleTagManager } from '@next/third-parties/google';

import { Providers } from '../components/Providers';
import { timezone } from '../config';
import './global.css';
import { Inter } from 'next/font/google';
import { SettingsProvider } from '@/context/AssistantSettingsContext';
import { isProductionTargetEnv } from '@/libs/utils/env';
import { SearchThreadsProvider } from '@/context/SearchThreadsContext';
import { routing } from '@/i18n/routing';
import { notFound } from 'next/navigation';

const JoyrideProvider = dynamic<JoyrideProviderProps>(() =>
  import('@/context/OnboardingContext').then((mod) => mod.JoyrideProvider)
);

type JoyrideProviderProps = {
  children: React.ReactNode;
};

type Props = {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

const interFont = Inter({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800'],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider timeZone={timezone} messages={messages}>
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
    </NextIntlClientProvider>
  );
}
