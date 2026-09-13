import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PublicAssistant } from '@/app/[locale]/public/components/Assistant/Assistant';

type Props = {
  params: Promise<{
    publicId: string;
    locale: string;
    projectId: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'public-thread' });

  return {
    title: t('metadata-title'),
  };
}

export default async function ThreadPage({ params }: Props) {
  const { publicId: threadId, locale, projectId } = await params;
  if (!threadId) {
    notFound();
  }

  setRequestLocale(locale);

  return <PublicAssistant threadId={threadId} accessToken={projectId} />;
}
