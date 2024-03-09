import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

import { useTranslations } from 'next-intl';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('index'),
  };
}

export default function Index({ params: { locale } }: Props) {
  setRequestLocale(locale);
  const t = useTranslations('Index');

  /*
   * Replace the elements below with your own.
   *
   * Note: The corresponding styles are in the ./index.none file.
   */
  return (
    <>
      <h1>{t('title')}</h1>
    </>
  );
}
