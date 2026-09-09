import { setRequestLocale } from 'next-intl/server';

export const dynamic = 'force-dynamic';

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
    <div className="h-full bg-background">
      <main className="flex h-screen w-screen items-center justify-center">
        {children}
      </main>
    </div>
  );
}
