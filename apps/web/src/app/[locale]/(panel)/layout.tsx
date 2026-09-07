export const dynamic = 'force-dynamic';

import { Navbar, NavbarSection, NavbarSpacer } from '@ragenai/tui/navbar';
import {
  Sidebar,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@ragenai/common-ui/Sidebar';
import {
  MagnifyingGlassIcon as MagnifyingGlassIconOutline,
  BookOpenIcon as BookOpenIconOutline,
} from '@heroicons/react/24/outline';
import { MainSidebarBody } from '@/app/components/Sidebar/SidebarContent/MainSidebarBody';
import { SidebarFooterMenu } from '@/app/components/Sidebar/SidebarContent/SidebarFooterMenu';
import { SearchButton } from '@/app/components/Sidebar/SearchButton';
import { ChatButton } from '@/app/components/Sidebar/ChatButton';
import { SidebarToggleButton } from '@/app/components/Sidebar/SidebarToggleButton';
import { NotificationBell } from '@/app/components/Notifications/NotificationBell';
import { PanelLayoutWrapper } from '@/app/components/Layout/PanelLayoutWrapper';
import { getTranslations } from 'next-intl/server';
import { OrganizationSwitcher } from '@/app/components/Sidebar/OrganizationSwitcher';
import { getUserOrganizationsQuery } from '@/features/organizations/services/queries/get-user-organizations-query';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { isAppAdmin, canManageOrg } from '@/lib/auth-access-control';
import { getActiveMember } from '@/lib/auth-guards';
import { ensureOnboardingComplete } from '@/features/onboarding/services/commands/ensure-onboarding-complete';
import { SupportFloatingButton } from '@/app/components/Support/SupportFloatingButton';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { getEffectiveFeaturesQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function PanelLayout({ children }: Props) {
  // Ensure onboarding is finalized (handles OAuth sign-up where
  // finalizeOnboardingCommand hasn't run yet)
  await ensureOnboardingComplete();

  const [t, user, activeOrgId, organizations] = await Promise.all([
    getTranslations('sidebar'),
    getCurrentUser(),
    getOrgIdFromAuth(),
    getUserOrganizationsQuery(),
  ]);

  const member = activeOrgId ? await getActiveMember(activeOrgId) : null;
  const userIsOrgAdmin =
    (user && isAppAdmin(user)) || (member ? canManageOrg(member.role) : false);

  // Client components gate opt-in controls (voice dictation, public thread
  // links) on these. Resolved once here rather than per component: the query
  // reads organization settings plus the org's subscription, and every
  // consumer wants the same answer for the same request.
  const features = activeOrgId
    ? await getEffectiveFeaturesQuery(activeOrgId)
    : DEFAULT_FEATURES;

  const navbar = (
    <Navbar>
      <NavbarSpacer />
      <NavbarSection>
        <SearchButton variant="navbar" aria-label={t('search')}>
          <MagnifyingGlassIconOutline className="w-5 h-5" />
        </SearchButton>
        <NotificationBell variant="navbar" />
      </NavbarSection>
    </Navbar>
  );

  /**
   * Three things used to sit at the top with identical visual weight — the
   * organization switcher, the team switcher and "New chat" — so nothing read
   * as primary, and the action the product exists for looked like a menu row.
   *
   * Now: one filled action, then the two things you reach for beside it, then
   * destinations. The organization switcher moves into the footer, where a
   * context indicator belongs. The team switcher is gone from the sidebar
   * entirely — it only selects which LiteLLM key attributes the cost, it was
   * visible to platform admins alone, and "No team" told a viewer nothing.
   * That belongs in settings, not in the primary navigation.
   *
   * Notifications stay here rather than moving to the navbar: the navbar is
   * `lg:hidden`, so a bell that lived there would vanish on desktop.
   */
  const sidebar = (
    <Sidebar>
      <SidebarHeader>
        <SidebarSection>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Ragen
            </span>
            <span className="hidden lg:block">
              <SidebarToggleButton />
            </span>
          </div>
          <ChatButton variant="primary">{t('new-chat')}</ChatButton>
          <SearchButton variant="sidebar">
            <MagnifyingGlassIconOutline className="size-5 shrink-0 stroke-muted-foreground" />
            <SidebarLabel className="font-normal">{t('search')}</SidebarLabel>
          </SearchButton>
        </SidebarSection>

        <SidebarSection>
          <NotificationBell variant="sidebar" />
          {userIsOrgAdmin && (
            <SidebarItem href="/knowledge/documents-list">
              <BookOpenIconOutline className="size-5 shrink-0 stroke-muted-foreground" />
              <SidebarLabel className="font-normal">
                {t('manage-knowledge')}
              </SidebarLabel>
            </SidebarItem>
          )}
        </SidebarSection>
      </SidebarHeader>

      <MainSidebarBody />
      <SidebarFooterMenu
        contextSlot={
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrgId}
            isAppAdmin={isAppAdmin(user)}
          />
        }
      />
    </Sidebar>
  );

  return (
    <OrgFeaturesProvider features={features}>
      <PanelLayoutWrapper navbar={navbar} sidebar={sidebar}>
        {children}
        <SupportFloatingButton />
      </PanelLayoutWrapper>
    </OrgFeaturesProvider>
  );
}
