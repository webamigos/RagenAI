import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Start } from '@/app/components/Start';
import { PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('index.title') };
}

export default async function LocaleRootPage({ params }: PropsWihLocale) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/${locale}/sign-in`);
  }

  return <Start />;
}
