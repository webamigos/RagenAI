import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { Start } from '../../components/Start';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('index.title'),
  };
}

export default function Index({ params: { locale } }: Props) {
  setRequestLocale(locale);
  const { userId } = auth();

  if (!userId) {
    redirect('/sign-in');
  }

  /*
   * Replace the elements below with your own.
   *
   * Note: The corresponding styles are in the ./index.none file.
   */
  return <Start />;
}
