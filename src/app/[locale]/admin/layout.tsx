'use client';

import { NextIntlClientProvider, useMessages, useLocale } from 'next-intl';

import { DocumentsProvider } from '@/context/DocumentsContext';
import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function AdminLayout({ children }: Props) {
  const messages = useMessages();
  const locale = useLocale();

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <div className="h-screen flex flex-col">
        <Toast />
        <DocumentsProvider>
          <Sidebar>{children}</Sidebar>
        </DocumentsProvider>
      </div>
    </NextIntlClientProvider>
  );
}
