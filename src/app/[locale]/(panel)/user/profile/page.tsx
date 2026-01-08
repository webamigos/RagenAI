import { getTranslations } from 'next-intl/server';
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
    title: subPath ? t(`my-profile:${subPath}.title`) : t('my-profile.title'),
  };
}

export default async function MyProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // TODO: Create Better Auth user profile page
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My Profile</h1>
      <div className="space-y-2">
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>Name:</strong> {user.name || 'Not set'}
        </p>
        <p className="text-sm text-gray-500 mt-4">
          User profile management is being migrated to Better Auth.
        </p>
      </div>
    </div>
  );
}
