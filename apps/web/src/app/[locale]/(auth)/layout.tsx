import { setRequestLocale } from 'next-intl/server';

import { InstanceBrandingProvider } from '@/context/InstanceBrandingContext';
import { getInstanceBrandingQuery } from '@/features/branding/services/queries/get-instance-branding-query';

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
  // The sign-in pages carry the install's logo and palette too: they are the
  // first thing a new user sees, before any session exists. Cached and
  // never throwing, so a database blip shows Ragen's branding, not an error.
  const branding = await getInstanceBrandingQuery();
  return (
    <InstanceBrandingProvider branding={branding}>
      <div className="h-full bg-background">
        <main className="flex h-screen w-screen items-center justify-center">
          {children}
        </main>
      </div>
    </InstanceBrandingProvider>
  );
}
