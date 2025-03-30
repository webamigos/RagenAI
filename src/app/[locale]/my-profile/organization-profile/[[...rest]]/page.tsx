import { ManageOrganization } from '@/app/components/MyProfile/OrganizationProfile';
import { getTranslations } from 'next-intl/server';
import { getSubscriptionData } from '../../subscription/actions';

type Props = {
  params: {
    locale: string;
    rest: string[];
  };
};

export async function generateMetadata({ params: { locale, rest } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const subPath = rest?.[0];

  return {
    title: subPath
      ? t(`organization-profile:${subPath}.title`)
      : t('organization-profile.title'),
  };
}

export default async function OrganizationProfilePage() {
  const subscription = await getSubscriptionData();

  return <ManageOrganization subscription={subscription} />;
}
