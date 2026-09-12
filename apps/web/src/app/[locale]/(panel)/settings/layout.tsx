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
  type SettingsGroup,
  type SettingsPage,
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

  // One rail, three sections — gap 8. Both halves are filtered by the same
  // predicate the organization layout enforces, so a member sees no link they
  // would only be redirected away from. The routes still live under
  // `/organization/**` behind that layout: this merges the navigation, not
  // the authorization.
  //
  // The sections are built from the entries' `group`, not from which registry
  // they came from. The registries are split by where the guard is, and that
  // is not the split a reader is looking for: PII policy and Knowledge
  // analytics are administrator screens under the guarded prefix *and* the two
  // screens someone goes looking for under "privacy".
  const visible = filterSettingsPages(
    [...settingsRegistry, ...organizationRegistry],
    access,
  );

  const inGroup = (group: SettingsGroup): SettingsPage[] =>
    visible.filter((page) => page.group === group);

  const sections = [
    { headingKey: 'settings-page.nav.you-section', items: inGroup('you') },
    {
      headingKey: 'settings-page.nav.privacy-section',
      items: inGroup('privacy'),
    },
    {
      headingKey: 'settings-page.nav.organization-section',
      items: inGroup('organization'),
    },
  ];

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Desktop: left sidebar */}
      {/* 216px, matching the knowledge base rail and the phase 8 spec. */}
      <div className="hidden w-[216px] shrink-0 border-r border-border p-6 lg:block">
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
