import { setRequestLocale } from 'next-intl/server';
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
  return {
    title: 'Wątek publicznego chatbota',
  };
}

export default async function ThreadPage({ params }: Props) {
  const { publicId, locale, projectId } = await params;
  const threadPublicId = publicId;
  if (!threadPublicId) {
    notFound();
  }

  setRequestLocale(locale);

  return <PublicAssistant threadId={threadPublicId} accessToken={projectId} />;
}
