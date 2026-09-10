import { getTranslations } from 'next-intl/server';
import { SettingsNav } from './components/SettingsNav';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import {
  isAppAdmin,
  canManageOrg,
  hasOrgRole,
} from '@/lib/auth-access-control';
import {
  settingsRegistry,
  organizationRegistry,
} from '@/features/settings/registry';
import { filterSettingsPages } from '@/features/settings/filter';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function SettingsLayout({ children }: Props) {
  const [t, user, activeOrgId] = await Promise.all([
    getTranslations('settings-page'),
    getCurrentUser(),
    getOrgIdFromAuth(),
  ]);

  const member = activeOrgId ? await getActiveMember(activeOrgId) : null;
  const access = {
    isAppAdmin: isAppAdmin(user),
    canManageOrg: member ? canManageOrg(member.role) : false,
    isOrgOwner: member ? hasOrgRole(member.role, 'owner') : false,
  };

  // One rail, two sections — gap 8. The organization half is filtered by the
  // same predicate its own layout enforces, so a member sees no link they
  // would only be redirected away from. The routes still live under
  // `/organization/**` behind that layout: this merges the navigation, not
  // the authorization.
  const sections = [
    { items: filterSettingsPages(settingsRegistry, access) },
    {
      headingKey: 'settings-page.nav.organization-section',
      items: filterSettingsPages(organizationRegistry, access),
    },
  ];

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Desktop: left sidebar */}
      <div className="hidden lg:block w-56 shrink-0 border-r border-border p-6">
        <h1 className="text-lg font-semibold text-foreground mb-4">
          {t('title')}
        </h1>
        <SettingsNav sections={sections} />
      </div>
      {/* Mobile: horizontal scrollable tabs */}
      <div className="lg:hidden border-b border-border">
        <SettingsNav sections={sections} variant="tabs" />
      </div>
      <div className="flex-1 p-6 overflow-auto">{children}</div>
    </div>
  );
}
