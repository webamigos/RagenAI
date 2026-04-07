import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Assistant } from '../../../../components/Assistant';

type Props = {
  params: Promise<{
    threadId: string;
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

export default async function ChatPage({ params }: Props) {
  const { locale, threadId } = await params;
  if (!threadId) {
    notFound();
  }

  setRequestLocale(locale);

  return <Assistant threadId={threadId} />;
}
