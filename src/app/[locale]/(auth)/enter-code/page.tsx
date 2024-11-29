import { getTranslations, setRequestLocale } from 'next-intl/server';

import { EnterCodeForm } from '@/app/components/Forms/EnterCodeForm';
import { PropsWihLocale } from '@/app/lib/types/types';
import { Toast } from '@/app/components/Toast';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('enter-code.title'),
  };
}

export default function EnterCodePage({ params: { locale } }: PropsWihLocale) {
  setRequestLocale(locale);
  return (
    <>
      <Toast />
      <EnterCodeForm />
    </>
  );
}
