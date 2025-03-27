import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PublicAssistant } from '@/app/[locale]/public/components/Assistant/Assistant';

type Props = {
  params: {
    publicId: string;
    locale: string;
    projectId: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: 'Wątek publicznego chatbota',
  };
}

export default function ThreadPage({
  params: { publicId, locale, projectId },
}: Props) {
  const threadPublicId = publicId;
  if (!threadPublicId) {
    notFound();
  }

  setRequestLocale(locale);

  return <PublicAssistant threadId={threadPublicId} accessToken={projectId} />;
}
