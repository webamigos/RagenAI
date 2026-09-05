import './[locale]/global.css';

import { cookies } from 'next/headers';
import { hasLocale } from 'next-intl';

import { routing } from '@/i18n/routing';
import type { Locale } from '@/app/config';
import messagesEn from './messages/en.json';
import messagesPl from './messages/pl.json';
import messagesEs from './messages/es.json';
import messagesDe from './messages/de.json';
import messagesFr from './messages/fr.json';
import messagesPt from './messages/pt.json';
import messagesIt from './messages/it.json';
import messagesHu from './messages/hu.json';
import messagesBg from './messages/bg.json';
import messagesUk from './messages/uk.json';
import messagesDa from './messages/da.json';
import messagesSv from './messages/sv.json';
import messagesFi from './messages/fi.json';
import messagesCs from './messages/cs.json';
import messagesSk from './messages/sk.json';

import { NotFoundLayout } from './components/NotFound/NotFoundLayout';

const messagesByLocale: Record<Locale, typeof messagesEn> = {
  en: messagesEn,
  pl: messagesPl,
  es: messagesEs,
  de: messagesDe,
  fr: messagesFr,
  pt: messagesPt,
  it: messagesIt,
  hu: messagesHu,
  bg: messagesBg,
  uk: messagesUk,
  da: messagesDa,
  sv: messagesSv,
  fi: messagesFi,
  cs: messagesCs,
  sk: messagesSk,
};

// Rendered when a route has no locale segment matched (e.g. /pl/nonexistent falls through to root).
// Cannot use next-intl hooks — no NextIntlClientProvider in root layout.
// Reads locale from NEXT_LOCALE cookie set by next-intl middleware (proxy.ts).
export default async function NotFoundPage() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = hasLocale(routing.locales, localeCookie)
    ? localeCookie
    : routing.defaultLocale;

  const t = messagesByLocale[locale]['page404'];

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
          homePath={`/${locale}`}
        />
      </body>
    </html>
  );
}
