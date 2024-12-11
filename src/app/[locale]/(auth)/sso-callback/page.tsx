import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { setRequestLocale } from 'next-intl/server';

export default async function Page({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <AuthenticateWithRedirectCallback />;
}
