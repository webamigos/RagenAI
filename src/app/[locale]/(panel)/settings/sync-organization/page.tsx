import { getTranslations } from 'next-intl/server';

import { syncOrganizationAndProject } from '@/app/components/MyProfile/CreateOrganization/actions';
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
  const { success } = await syncOrganizationAndProject();
  if (success) {
    return (
      <div className="flex w-full">
        <Card size="full">
          <p className="font-bold text-green-700 dark:text-green-400">
            Synchronization status: OK
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full">
      <Card size="full">
        <p className="font-bold text-red-700 dark:text-red-400">
          Synchronization status: FAIL
        </p>
      </Card>
    </div>
  );
}
