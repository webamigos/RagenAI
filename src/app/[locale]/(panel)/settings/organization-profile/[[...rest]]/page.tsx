import { getTranslations } from 'next-intl/server';
import { getSubscriptionData } from '../../subscription/actions';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { redirect } from 'next/navigation';

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

export default async function OrganizationProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  const subscription = await getSubscriptionData();

  // TODO: Create Better Auth organization management UI
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Organization Profile</h1>
      {subscription && (
        <div className="space-y-2 mb-4">
          <p>
            <strong>Subscription Status:</strong> {subscription.status}
          </p>
          <p>
            <strong>Plan:</strong> {subscription.plan?.name}
          </p>
        </div>
      )}
      <p className="text-sm text-gray-500">
        Organization management UI is being migrated to Better Auth.
      </p>
    </div>
  );
}
