import { CreateOrganizationComponent } from '@/app/components/MyProfile/CreateOrganization';
import { PropsWihLocale } from '@/app/lib/types/types';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('create-organization.title'),
  };
}

export default function OrganizationsPage() {
  return <CreateOrganizationComponent />;
}
