import type { Metadata } from 'next';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import {
  getCurrentUser,
  getOrgIdFromAuth,
  isAppAdmin,
  canManageOrg,
  getActiveMember,
} from '@/app/lib/utils/auth-helpers';
import { DiskUsageSettings } from './components/DiskUsageSettings';

export const metadata: Metadata = {
  title: 'Disk Usage',
};

export default async function DiskUsagePage() {
  const [user, locale, orgId] = await Promise.all([
    getCurrentUser(),
    getLocale(),
    getOrgIdFromAuth(),
  ]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  // Required for everybody now, platform administrators included: the page
  // reports one organization's storage, so it needs to know which one.
  // Installation-wide storage moved to apps/admin (ADR-35).
  if (!orgId) {
    return redirect({ href: '/', locale });
  }

  // A platform administrator still reaches the page without being a member —
  // an access bypass, not a wider view.
  if (!isAppAdmin(user)) {
    const member = await getActiveMember(orgId);
    if (!member || !canManageOrg(member.role)) {
      return redirect({ href: '/', locale });
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Disk Usage</h1>
      <DiskUsageSettings />
    </div>
  );
}
