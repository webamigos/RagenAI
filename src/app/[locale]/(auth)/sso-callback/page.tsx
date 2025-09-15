import { PropsWihLocale } from '@/app/lib/types/types';
import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { setRequestLocale } from 'next-intl/server';

export default async function Page({ params }: PropsWihLocale) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuthenticateWithRedirectCallback />;
}
