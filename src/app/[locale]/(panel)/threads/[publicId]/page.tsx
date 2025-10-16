import { getTranslations, setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';

import { Assistant } from '../../../../components/Assistant';

type Props = {
  params: Promise<{
    publicId: string;
    locale: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('index.title'),
  };
}

export default async function ThreadPage({ params }: Props) {
  const { locale, publicId } = await params;
  const threadPublicId = publicId;
  if (!threadPublicId) {
    notFound();
  }

  setRequestLocale(locale);

  return <Assistant threadId={threadPublicId} />;
}
