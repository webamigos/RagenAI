import type { Metadata } from 'next';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { isAppAdmin } from '@/lib/auth-access-control';
import { DiskUsageSettings } from './components/DiskUsageSettings';

export const metadata: Metadata = {
  title: 'Disk Usage',
};

export default async function DiskUsagePage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  if (!isAppAdmin(user)) {
    return redirect({ href: '/', locale });
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Disk Usage</h1>
      <DiskUsageSettings />
    </div>
  );
}
