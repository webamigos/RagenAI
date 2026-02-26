import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { DiskUsageSettings } from './components/DiskUsageSettings';

export default async function DiskUsagePage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  // Only app admins can access this page
  if (user.role !== 'admin') {
    return redirect({ href: '/', locale });
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Disk Usage</h1>
      <DiskUsageSettings />
    </div>
  );
}
