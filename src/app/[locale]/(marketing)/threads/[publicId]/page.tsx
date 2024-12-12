import { getTranslations, setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';

import { Assistant } from '../../../../components/Assistant';

type Props = {
  params: {
    publicId: string;
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('index.title'),
  };
}

export default function ThreadPage({ params: { publicId, locale } }: Props) {
  const threadPublicId = publicId;
  if (!threadPublicId) {
    notFound();
  }

  setRequestLocale(locale);

  return <Assistant threadId={threadPublicId} />;
}
