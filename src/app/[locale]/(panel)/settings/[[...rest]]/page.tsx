import { AccountDetails } from '@/app/components/MyProfile/AccountDetails';
import { getTranslations } from 'next-intl/server';

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
    title: subPath ? t(`my-profile:${subPath}.title`) : t('my-profile.title'),
  };
}

export default function MyProfilePage() {
  return <AccountDetails />;
}
