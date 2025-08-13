import { AccountDetails } from '@/app/components/MyProfile/AccountDetails';
import { getTranslations } from 'next-intl/server';

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
    title: subPath ? t(`my-profile:${subPath}.title`) : t('my-profile.title'),
  };
}

export default function MyProfilePage() {
  return <AccountDetails />;
}
