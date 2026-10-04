import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isAppAdmin, canManageOrg } from '@/lib/auth-access-control';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function OrganizationLayout({ children }: Props) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return redirect({ href: '/', locale });
  }

  // App admins always see the org section; org members need admin role.
  if (!isAppAdmin(user)) {
    const member = await getActiveMember(orgId);
    if (!member || !canManageOrg(member.role)) {
      return redirect({ href: '/settings/general', locale });
    }
  }

  // No menu column of its own: inside this section the sidebar lists the
  // organization's pages in place of the main menu (#1399), so the content has
  // the width the second column used to take.
  return <div className="min-h-full flex-1 overflow-auto p-6">{children}</div>;
}
