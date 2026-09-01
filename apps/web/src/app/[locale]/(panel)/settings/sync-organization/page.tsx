import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { redirect } from 'next/navigation';

import { Card } from '@ragenai/common-ui/Card';

export async function generateMetadata() {
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
        <p className="font-bold text-zinc-700 dark:text-zinc-400">
          Organization synchronization is now automatic with Better Auth.
        </p>
        <p className="text-sm text-zinc-500 mt-2">
          This page is no longer needed as organizations are created and synced
          during signup.
        </p>
      </Card>
    </div>
  );
}
