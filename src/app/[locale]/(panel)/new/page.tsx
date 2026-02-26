import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Start } from '../../../components/Start';
import { type PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('index.title'),
  };
}

export default async function NewChatPage({ params }: PropsWihLocale) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Start />;
}
