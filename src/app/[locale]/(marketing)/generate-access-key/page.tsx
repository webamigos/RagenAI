import { setRequestLocale } from 'next-intl/server';

import { GenerateAccessKey } from './components/generate-access-key';
import { auth } from '@clerk/nextjs/server';
import { fetchOrganizationByProviderId } from '@/app/lib/services/apiKeys';
import { Noto_Sans_Tamil_Supplement } from 'next/font/google';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: '😶‍🌫️ Generowanie klucza dostępu do organizacji',
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
    <div>
      <div className="container mx-auto h-full mt-4">
        <GenerateAccessKey organizationRecord={organizationRecord} />
      </div>
    </div>
  );
}
