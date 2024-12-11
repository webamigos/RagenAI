import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ForgotPasswordForm } from '@/app/components/Forms/ForgotPasswordForm';
import { PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('forgot-password.title'),
  };
}

export default function ForgotPasswordPage({
  params: { locale },
}: PropsWihLocale) {
  setRequestLocale(locale);
  return <ForgotPasswordForm />;
}
