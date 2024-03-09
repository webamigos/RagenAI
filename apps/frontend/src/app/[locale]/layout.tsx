import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';

import { Providers } from '../components/Providers';
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
    <html lang={locale} className="h-full" suppressHydrationWarning>
      <body className={`${inter.className} h-full`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
