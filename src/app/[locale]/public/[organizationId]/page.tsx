import { setRequestLocale } from 'next-intl/server';

import { PublicStart } from '../components/public-start';

type Props = {
  params: {
    locale: string;
    organizationId: string;
  };
};

export async function generateMetadata({
  params: { locale, organizationId },
}: Props) {
  return {
    title: 'Publiczny chatbot',
  };
}

export default function Index({ params: { locale, organizationId } }: Props) {
  setRequestLocale(locale);
  return (
    <div>
      {/* <div className="text-center text-sm text-gray-500">
        Your organization access token is: {organizationId}
      </div> */}
      <div className="container mx-auto h-full mt-4">
        <PublicStart organizationId={organizationId} />
      </div>
    </div>
  );
}
