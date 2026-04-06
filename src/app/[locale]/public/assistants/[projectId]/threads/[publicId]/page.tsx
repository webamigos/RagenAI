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

export async function generateMetadata() {
  return {
    title: 'Wątek publicznego chatbota',
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
