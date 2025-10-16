import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ResetPasswordForm } from '@/app/components/Forms';
import { PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-in.title'),
  };
}

export default async function ResetPasswordPage({ params }: PropsWihLocale) {
  const { locale } = await params;

  setRequestLocale(locale);
  return <ResetPasswordForm />;
}
