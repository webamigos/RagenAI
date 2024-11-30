import { setRequestLocale } from 'next-intl/server';

type Props = {
  readonly children: React.ReactNode;
  params: {
    locale: string;
  };
};

export default function AuthLayout({ children, params: { locale } }: Props) {
  setRequestLocale(locale);
  return (
    <div className="h-full bg-primary-light dark:bg-primary-dark">
      <main className="flex h-screen w-screen items-center justify-center">
        {children}
      </main>
    </div>
  );
}
