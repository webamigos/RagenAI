import { type PropsWihLocale } from '@/app/lib/types/types';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { redirect } from 'next/navigation';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('create-organization.title'),
  };
}

export default async function OrganizationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // TODO: Create Better Auth organization creation UI
  // For now, show placeholder - organizations are created automatically on user signup
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Create Organization</h1>
      <p className="text-gray-600">
        Organizations are automatically created when you sign up.
      </p>
      <p className="text-sm text-gray-500 mt-4">
        Organization management UI is being migrated to Better Auth.
      </p>
    </div>
  );
}
