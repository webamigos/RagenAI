import Link from 'next/link';
import { NextIntlClientProvider, useMessages } from 'next-intl';

import { timezone } from '@/app/config';
import { Logo } from '../../components/Logo';

type Props = {
  readonly children: React.ReactNode;
};

export default function AuthLayout({ children }: Props) {
  const messages = useMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="h-full bg-primary-light dark:bg-primary-dark">
        <main className="flex h-screen w-screen items-center justify-center">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
