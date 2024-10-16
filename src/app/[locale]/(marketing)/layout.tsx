import { NextIntlClientProvider, useMessages } from 'next-intl';

import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';
import { timezone } from '@/app/config';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function MarketingLayout({ children }: Props) {
  const messages = useMessages();

  return (
    <NextIntlClientProvider timeZone={timezone} messages={messages}>
      <Toast />
      <div className="h-screen flex flex-col">
        <Sidebar>{children}</Sidebar>
      </div>
    </NextIntlClientProvider>
  );
}
