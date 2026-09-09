import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isAppAdmin, canManageOrg } from '@/lib/auth-access-control';
import { OrganizationNav } from './components/OrganizationNav';

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

  const t = await getTranslations('organization-page');

  return (
    <div className="flex min-h-full">
      <div className="w-56 shrink-0 border-r border-border p-6">
        <h1 className="text-lg font-semibold text-foreground mb-4">
          {t('title')}
        </h1>
        <OrganizationNav />
      </div>
      <div className="flex-1 p-6 overflow-auto">{children}</div>
    </div>
  );
}
