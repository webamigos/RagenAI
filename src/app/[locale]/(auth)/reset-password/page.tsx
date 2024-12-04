import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ResetPasswordForm } from '@/app/components/Forms';
import { PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-in.title'),
  };
}

export default function ResetPasswordPage({
  params: { locale },
}: PropsWihLocale) {
  setRequestLocale(locale);
  return <ResetPasswordForm />;
}
