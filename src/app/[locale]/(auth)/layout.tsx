import Link from 'next/link';
import { Logo } from '../../components/Logo';
import { NextIntlClientProvider, useMessages } from 'next-intl';

type Props = {
  readonly children: React.ReactNode;
};

export default function AuthLayout({ children }: Props) {
  const messages = useMessages();

  return (
    <NextIntlClientProvider timeZone="Europe/Warsaw" messages={messages}>
      <div className="h-full ">
        <header className="absolute inset-x-0 top-0 z-50 bg-black">
          <nav
            className="flex items-center justify-between p-6 lg:px-8"
            aria-label="Global"
          >
            <Link href="/">
              <Logo />
            </Link>
          </nav>
        </header>
        <main className="flex h-screen w-screen items-center justify-center">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
