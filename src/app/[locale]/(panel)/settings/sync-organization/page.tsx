import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { redirect } from '@/i18n/routing';

import { PropsWihLocale } from '@/app/lib/types/types';
import { Card } from '@ragenai/common-ui/Card';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: 'Sync organization',
  };
}

// IT's only for internal purpose in situations that organization synchronization
// failed during creation
export default async function SyncOrganizationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // TODO: Organization sync functionality needs to be reimplemented for Better Auth
  // Organizations are now automatically created and synced during user signup
  return (
    <div className="flex w-full">
      <Card size="full">
        <p className="font-bold text-gray-700 dark:text-gray-400">
          Organization synchronization is now automatic with Better Auth.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          This page is no longer needed as organizations are created and synced
          during signup.
        </p>
      </Card>
    </div>
  );
}
