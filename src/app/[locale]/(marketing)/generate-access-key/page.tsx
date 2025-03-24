import { getTranslations, setRequestLocale } from 'next-intl/server';

import { GenerateAccessKey } from './components/generate-access-key';
import { auth } from '@clerk/nextjs/server';
import { fetchOrganizationByProviderId } from '@/app/lib/services/apiKeys';
import { fetchOrganizationDefaultProject } from '@/app/lib/services/apiKeys';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('generate-access-key.title'),
  };
}

export default async function Index({ params: { locale } }: Props) {
  setRequestLocale(locale);
  const { orgId } = auth();

  if (!orgId) {
    return null;
  }
  const organizationRecord = await fetchOrganizationByProviderId(orgId);
  const defaultProject = await fetchOrganizationDefaultProject(
    organizationRecord.id
  );

  return (
    <div className="container mx-auto pr-[0.6rem]">
      <GenerateAccessKey
        organizationRecord={organizationRecord}
        projectId={defaultProject.id}
      />
    </div>
  );
}
