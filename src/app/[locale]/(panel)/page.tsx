import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Start } from '../../components/Start';
import { PropsWihLocale } from '@/app/lib/types/types';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('index.title'),
  };
}

export default async function Index({ params }: PropsWihLocale) {
  const { locale } = await params;
  setRequestLocale(locale);

  /*
   * Replace the elements below with your own.
   *
   * Note: The corresponding styles are in the ./index.none file.
   */
  return <Start />;
}
