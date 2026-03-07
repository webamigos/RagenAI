import type { Metadata } from 'next';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import {
  getCurrentUser,
  getOrgIdFromAuth,
  isAppAdmin,
  isOrgAdmin,
  getActiveMember,
} from '@/app/lib/utils/auth-helpers';
import { AiUsageDashboard } from './components/AiUsageDashboard';

export const metadata: Metadata = {
  title: 'AI Usage',
};

export default async function AiUsagePage() {
  const [user, locale, orgId] = await Promise.all([
    getCurrentUser(),
    getLocale(),
    getOrgIdFromAuth(),
  ]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  const userIsAppAdmin = isAppAdmin(user);

  if (!userIsAppAdmin) {
    if (!orgId) {
      return redirect({ href: '/', locale });
    }
    const member = await getActiveMember(orgId);
    if (!member || !isOrgAdmin(member.role)) {
      return redirect({ href: '/', locale });
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">AI Usage</h1>
      <AiUsageDashboard
        isAppAdmin={userIsAppAdmin}
        orgId={orgId ?? undefined}
      />
    </div>
  );
}
