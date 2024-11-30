import { setRequestLocale } from 'next-intl/server';
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
    <div>
      {/* <div className="text-center text-sm text-gray-500">
        Your organization access token is: {organizationId}
      </div> */}
      <PublicAssistant
        threadId={threadPublicId}
        organizationId={organizationId}
      />
    </div>
  );
}
