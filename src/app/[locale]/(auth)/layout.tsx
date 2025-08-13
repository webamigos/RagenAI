import { setRequestLocale } from 'next-intl/server';

type Props = {
  readonly children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

export default async function AuthLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="h-full bg-primary-light dark:bg-primary-dark">
      <main className="flex h-screen w-screen items-center justify-center">
        {children}
      </main>
    </div>
  );
}
