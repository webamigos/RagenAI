import { setRequestLocale } from 'next-intl/server';

import { GenerateAccessKey } from './components/generate-access-key';
import { auth } from '@clerk/nextjs/server';
import { fetchOrganizationByProviderId } from '@/app/lib/services/apiKeys';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: 'Generowanie klucza dostępu do organizacji',
  };
}

export default async function Index({ params: { locale } }: Props) {
  setRequestLocale(locale);
  const { orgId } = auth();

  if (!orgId) {
    return null;
  }
  const organizationRecord = await fetchOrganizationByProviderId(orgId);

  return (
    <div className="container mx-auto pr-[0.6rem]">
      <GenerateAccessKey organizationRecord={organizationRecord} />
    </div>
  );
}
