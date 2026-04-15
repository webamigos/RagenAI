import './[locale]/global.css';

import { cookies } from 'next/headers';

import { routing } from '@/i18n/routing';
import { NotFoundLayout } from './components/NotFound/NotFoundLayout';

// Rendered when a route has no locale segment matched (e.g. /pl/nonexistent falls through to root).
// Cannot use next-intl hooks — no NextIntlClientProvider in root layout.
// Reads locale from NEXT_LOCALE cookie set by next-intl middleware (proxy.ts).
export default async function NotFoundPage() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const locale =
    localeCookie && routing.locales.includes(localeCookie as any)
      ? localeCookie
      : routing.defaultLocale;

  const messages = (await import(`./messages/${locale}.json`)).default;
  const t = messages['page404'] as Record<string, string>;

  return (
    <html lang={locale} className="h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="h-full">
        <NotFoundLayout
          title={t['page-not-found']}
          description={t['sorry-we-could-not-find']}
          backLabel={t['go-back-home']}
        />
      </body>
    </html>
  );
}
