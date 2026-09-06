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

  // An active organization is now required for everybody, platform
  // administrators included: the page reports one organization's usage, and
  // that is the organization it reports. Cross-installation totals moved to
  // apps/admin (ADR-35).
  if (!orgId) {
    return redirect({ href: '/', locale });
  }

  // A platform administrator still reaches the page without being a member —
  // that is an access bypass, not a wider view.
  if (!isAppAdmin(user)) {
    const member = await getActiveMember(orgId);
    if (!member || !canManageOrg(member.role)) {
      return redirect({ href: '/', locale });
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">AI Usage</h1>
      <AiUsageDashboard />
    </div>
  );
}
