import './[locale]/global.css';

import { cookies } from 'next/headers';
import { hasLocale } from 'next-intl';

import { routing } from '@/i18n/routing';
import messagesEn from './messages/en.json';
import messagesPl from './messages/pl.json';

import { NotFoundLayout } from './components/NotFound/NotFoundLayout';

// Rendered when a route has no locale segment matched (e.g. /pl/nonexistent falls through to root).
// Cannot use next-intl hooks — no NextIntlClientProvider in root layout.
// Reads locale from NEXT_LOCALE cookie set by next-intl middleware (proxy.ts).
export default async function NotFoundPage() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = hasLocale(routing.locales, localeCookie)
    ? localeCookie
    : routing.defaultLocale;

  const t = (locale === 'pl' ? messagesPl : messagesEn)['page404'];

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
