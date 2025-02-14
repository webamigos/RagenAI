import { setRequestLocale } from 'next-intl/server';

import { PublicStart } from '../components/public-start';

type Props = {
  params: {
    locale: string;
    organizationId: string;
  };
  searchParams: {
    widgetMode?: boolean;
  };
};

export async function generateMetadata({
  params: { locale, organizationId },
}: Props) {
  return {
    title: 'Publiczny chatbot',
  };
}

export default function Index({
  params: { locale, organizationId },
  searchParams,
}: Props) {
  setRequestLocale(locale);

  return (
    <div>
      <div className="container mx-auto h-full">
        <PublicStart
          organizationId={organizationId}
          widgetMode={searchParams.widgetMode}
        />
      </div>
    </div>
  );
}
