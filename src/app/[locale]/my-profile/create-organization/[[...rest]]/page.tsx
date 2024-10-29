import { CreateOrganizationComponent } from '@/app/components/MyProfile/CreateOrganization';
import { getTranslations } from 'next-intl/server';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('create-organization.title'),
  };
}

export default function OrganizationsPage() {
  return <CreateOrganizationComponent />;
}
