/**
 * The document shell for every localized page.
 *
 * **It injects no analytics, tag manager or product telemetry, deliberately.**
 * It used to: `isProductionTargetEnv && <GoogleTagManager gtmId="GTM-…" />`,
 * with the vendor's container id as a literal in an Apache-2.0 repository. A
 * self-hosted deployment reports its traffic to whoever owns that container,
 * and `apps/docs/docs/self-hosting.md` tells self-hosters to set exactly the
 * variable that switched it on. Measuring traffic is a vendor concern, so it
 * lives in `apps/docs`, which nobody but the vendor deploys.
 *
 * `tests/architecture/analytics-ids-are-not-hardcoded.test.ts` fails if an id
 * comes back. See
 * `docs/lessons/a-hardcoded-analytics-id-tracks-every-self-hoster.md`.
 */
import { getMessages, setRequestLocale } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';

import { Providers } from '../components/Providers';
import { timezone } from '../config';
import './global.css';
import { Inter } from 'next/font/google';
import { SettingsProvider } from '@/context/AssistantSettingsContext';
import { SearchThreadsProvider } from '@/context/SearchThreadsContext';
import { GlobalSearchDialog } from '@/app/components/Sidebar/ThreadsHistory/GlobalSearchDialog';
import { routing } from '@/i18n/routing';
import { notFound } from 'next/navigation';

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
    <NextIntlClientProvider
      locale={locale}
      timeZone={timezone}
      messages={messages}
    >
      <html lang={locale} className="h-full" suppressHydrationWarning>
        <body className={`${interFont.className} h-full`}>
          <Providers>
            <SearchThreadsProvider>
              <GlobalSearchDialog />
              <SettingsProvider>{children}</SettingsProvider>
            </SearchThreadsProvider>
          </Providers>
        </body>
      </html>
    </NextIntlClientProvider>
  );
}
