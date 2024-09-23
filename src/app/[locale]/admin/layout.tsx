import { NextIntlClientProvider, useMessages } from 'next-intl';

import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function AdminLayout({ children }: Props) {
  const messages = useMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="h-screen flex flex-col">
        <Toast />
        <Sidebar>{children}</Sidebar>
      </div>
    </NextIntlClientProvider>
  );
}
