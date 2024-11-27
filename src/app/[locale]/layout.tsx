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
import { Prompt } from 'next/font/google';
import { SidebarProvider } from '@/context/SidebarContext';
import { SettingsProvider } from '@/context/AssistantSettingsContext';
import { isProductionTargetEnv } from '@/libs/utils/env';

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

const promptFont = Prompt({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800'],
});

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
          {isProductionTargetEnv && <GoogleTagManager gtmId="GTM-MPJ4T77X" />}
          <body className={`${promptFont.className} h-full`}>
            <ThreadsContextProvider>
              <Providers>
                <SidebarProvider>
                  <SettingsProvider>
                    <JoyrideProvider>{children}</JoyrideProvider>
                  </SettingsProvider>
                </SidebarProvider>
              </Providers>
            </ThreadsContextProvider>
          </body>
        </html>
      </ClerkProvider>
    </NextIntlClientProvider>
  );
}
