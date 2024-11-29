import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PublicAssistant } from '../../../components/Assistant/Assistant';

type Props = {
  params: {
    publicId: string;
    locale: string;
    organizationId: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: 'Wątek publicznego chatbota',
  };
}

export default function ThreadPage({
  params: { publicId, locale, organizationId },
}: Props) {
  const threadPublicId = publicId;
  if (!threadPublicId) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <PublicAssistant
      threadId={threadPublicId}
      organizationId={organizationId}
    />
  );
}
