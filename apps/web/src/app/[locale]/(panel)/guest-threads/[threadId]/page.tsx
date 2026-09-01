import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Assistant } from '../../../../components/Assistant';
import { type PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('guest-threads.title'),
  };
}

export default async function ThreadPage({
  params,
}: PropsWihLocale & { params: Promise<{ threadId: string }> }) {
  const { locale, threadId } = await params;
  if (!threadId) {
    notFound();
  }

  setRequestLocale(locale);
  return <Assistant threadId={threadId} />;
}
