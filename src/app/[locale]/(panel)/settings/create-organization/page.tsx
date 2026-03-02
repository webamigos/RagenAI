import type { Metadata } from 'next';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { isAppAdmin } from '@/lib/auth-access-control';
import { CreateOrganizationForm } from './CreateOrganizationForm';

export const metadata: Metadata = {
  title: 'Create Organization',
};

export default async function CreateOrganizationPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  if (!isAppAdmin(user)) {
    return redirect({ href: '/', locale });
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        Create Organization
      </h1>
      <CreateOrganizationForm />
    </div>
  );
}
