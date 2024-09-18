import { NextIntlClientProvider, useMessages } from 'next-intl';

import { Sidebar } from '../../components/Sidebar';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default function MarketingLayout({ children }: Props) {
  const messages = useMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="h-screen flex flex-col">
        <Sidebar>{children}</Sidebar>
      </div>
    </NextIntlClientProvider>
  );
}
