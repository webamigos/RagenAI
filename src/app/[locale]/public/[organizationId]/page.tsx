import { setRequestLocale } from 'next-intl/server';

import { PublicStart } from '../components/public-start';
import { decodeKey } from '../../(marketing)/generate-access-key/actions/generate-key';

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

export default async function Index({
  params: { locale, organizationId },
  searchParams,
}: Props) {
  setRequestLocale(locale);

  const { projectId } = await decodeKey(organizationId);

  return (
    <div>
      <div className="container mx-auto h-full">
        <PublicStart
          organizationId={organizationId}
          projectId={projectId}
          widgetMode={searchParams.widgetMode}
        />
      </div>
    </div>
  );
}
