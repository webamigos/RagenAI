import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Assistant } from '../../../../components/Assistant';
import { PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('guest-threads.title'),
  };
}

export default async function ThreadPage({
  params,
}: PropsWihLocale & { params: Promise<{ publicId: string }> }) {
  const { locale, publicId } = await params;
  const threadPublicId = publicId;
  if (!threadPublicId) {
    notFound();
  }

  setRequestLocale(locale);
  return <Assistant threadId={threadPublicId} />;
}
