import { setRequestLocale } from 'next-intl/server';

type Props = {
  readonly children: React.ReactNode;
  params: {
    locale: string;
  };
};

export default function ProtectedLayout({
  children,
  params: { locale },
}: Props) {
  setRequestLocale(locale);
  return (
    <div className="h-screen w-screen flex justify-center items-center">
      {children}
    </div>
  );
}
