import { ManageOrganization } from '@/app/components/MyProfile/OrganizationProfile';
import { getTranslations } from 'next-intl/server';
import { getSubscriptionData } from '../../subscription/actions';

type Props = {
  params: Promise<{
    locale: string;
    rest: string[];
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale, rest } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const subPath = rest?.[0];

  return {
    title: subPath
      ? t(`organization-profile:${subPath}.title`)
      : t('organization-profile.title'),
  };
}

const FEATURE_FLAG_ALLOW_INVITE_TO_ORGANIZATION =
  !!process.env.FEATURE_FLAG_ALLOW_INVITE_TO_ORGANIZATION;

export default async function OrganizationProfilePage() {
  const subscription = await getSubscriptionData();

  return (
    <ManageOrganization
      allowAddToOrganization={FEATURE_FLAG_ALLOW_INVITE_TO_ORGANIZATION}
      subscription={subscription}
    />
  );
}
