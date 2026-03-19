import type { Metadata } from 'next';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser, isAppAdmin } from '@/app/lib/utils/auth-helpers';
import { AuditLogsDashboard } from './components/AuditLogsDashboard';

export const metadata: Metadata = {
  title: 'Audit Logs',
};

export default async function AuditLogsPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  if (!isAppAdmin(user)) {
    return redirect({ href: '/', locale });
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">Audit Logs</h1>
      <AuditLogsDashboard />
    </div>
  );
}
