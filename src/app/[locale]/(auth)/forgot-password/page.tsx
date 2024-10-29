import {
  getTranslations,
  unstable_setRequestLocale as setRequestLocale,
} from 'next-intl/server';

import { ForgotPasswordForm } from '@/app/components/Forms/ForgotPasswordForm';
import { PropsWihLocale } from '@/app/lib/types/types';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
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
