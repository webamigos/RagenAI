export const dynamic = 'force-dynamic';

import { Suspense } from 'react';

import { Navbar, NavbarSection, NavbarSpacer } from '@ragenai/common-ui/Navbar';
import {
  Sidebar,
  SidebarDivider,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@ragenai/common-ui/Sidebar';
import {
  MagnifyingGlassIcon as MagnifyingGlassIconOutline,
  BookOpenIcon as BookOpenIconOutline,
  ChatBubbleLeftIcon as ChatBubbleLeftIconOutline,
  FolderIcon as FolderIconOutline,
  LightBulbIcon as LightBulbIconOutline,
} from '@heroicons/react/24/outline';
import { MainSidebarBody } from '@/app/components/Sidebar/SidebarContent/MainSidebarBody';
import { SidebarFooterMenu } from '@/app/components/Sidebar/SidebarContent/SidebarFooterMenu';
import { SearchButton } from '@/app/components/Sidebar/SearchButton';
import { ShortcutHint } from '@/app/components/Sidebar/ShortcutHint';
import { ChatButton } from '@/app/components/Sidebar/ChatButton';
import { SidebarToggleButton } from '@/app/components/Sidebar/SidebarToggleButton';
import { Logo } from '@/app/components/Logo';
import { NotificationBell } from '@/app/components/Notifications/NotificationBell';
import { PanelLayoutWrapper } from '@/app/components/Layout/PanelLayoutWrapper';
import { getTranslations } from 'next-intl/server';
import { OrganizationSwitcher } from '@/app/components/Sidebar/OrganizationSwitcher';
import { getUserOrganizationsQuery } from '@/features/organizations/services/queries/get-user-organizations-query';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { isAppAdmin, canManageOrg, canOwnOrg } from '@/lib/auth-access-control';
import { getActiveMember } from '@/lib/auth-guards';
import { ensureOnboardingComplete } from '@/features/onboarding/services/commands/ensure-onboarding-complete';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { getEffectiveFeaturesQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';
import { Badge } from '@/components/ui/badge';
import { canUseBrain } from '@/features/brain/utils/can-use-brain';
import { filterSettingsPages } from '@/features/settings/filter';
import { navFeatureFlags } from '@/features/settings/nav-feature-flags';
import {
  organizationRegistry,
  settingsRegistry,
  type SettingsPage,
} from '@/features/settings/registry';
import { OutsideSectionMenu } from '@/app/components/Sidebar/SectionMenu/OutsideSectionMenu';
import { SectionSidebarBody } from '@/app/components/Sidebar/SectionMenu/SectionSidebarBody';
import { RememberLastPage } from '@/app/components/Sidebar/SectionMenu/RememberLastPage';

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

  // What each section's menu lists while the reader is inside it, where it
  // takes the sidebar's place: the organization's pages under /organization
  // (#1399), the user's own under /settings. Filtered here, with the
  // predicate the pages' guards use, so the sidebar draws what it is handed
  // and decides nothing about who may see which entry. Only the four fields it
  // renders cross to the client.
  //
  // The settings menu filters on `navFeatureFlags`, which keeps the memory
  // page listed while the user still has memories to erase; the feature read
  // inside it is the cached one above, not a second query.
  const access = {
    isAppAdmin: isAppAdmin(user),
    canManageOrg: member ? canManageOrg(member.role) : false,
    isOrgOwner: member ? canOwnOrg(member.role) : false,
  };
  const toNavItem = ({ id, path, labelKey, icon }: SettingsPage) => ({
    id,
    path,
    labelKey,
    icon,
  });
  const organizationItems = filterSettingsPages(organizationRegistry, {
    ...access,
    featureFlags: features,
  }).map(toNavItem);
  const settingsItems = filterSettingsPages(settingsRegistry, {
    ...access,
    featureFlags: activeOrgId ? await navFeatureFlags(activeOrgId) : {},
  }).map(toNavItem);

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
   * The header answers "where am I" before it offers anything to do: the
   * organization switcher first — in the slot shadcn's sidebar gives its
   * `TeamSwitcher`, beside the collapse button — then one filled action, then
   * the two things you reach for beside it, then destinations.
   *
   * The switcher used to live in the footer with the "Ragen" wordmark up here.
   * The wordmark told a signed-in user nothing they did not know, and the
   * footer is where a context indicator goes to be ignored. The row is
   * `flex` with the switcher at `min-w-0 flex-1` and the button `shrink-0`,
   * so a long organization name truncates instead of pushing the burger off
   * the edge — which is the only way the two share a line.
   *
   * The team switcher is gone from the sidebar entirely — it only selects
   * which LiteLLM key attributes the cost, it was visible to platform admins
   * alone, and "No team" told a viewer nothing. That belongs in settings, not
   * in the primary navigation.
   *
   * Notifications stay here rather than moving to the navbar: the navbar is
   * `lg:hidden`, so a bell that lived there would vanish on desktop.
   */
  const sidebar = (
    <Sidebar>
      <SidebarHeader>
        {/*
          Zone 1 — the brand row. The organization switcher used to sit here,
          which put "which tenant am I in" in the position a product normally
          uses to say what the product is, and left the sidebar with no fixed
          point at all. The switcher is in the footer now, beside the user,
          where the two halves of "where am I signed in" belong together.
        */}
        {/*
          The bell sits beside the wordmark, as an icon with its count: as a
          labelled row it cost the sidebar a line, which on a phone is a line
          of the thread list.
        */}
        <div className="mb-2 flex h-12 items-center gap-1">
          <Logo compact />
          <span className="ml-1 shrink-0">
            <NotificationBell variant="navbar" />
          </span>
          <span className="ml-auto hidden shrink-0 lg:block">
            <SidebarToggleButton />
          </span>
        </div>

        {/*
          Zones 2 and 3 are the main menu. Inside /organization and /settings
          the sidebar's body becomes that section's menu instead, so they step
          aside — the brand row above and the switcher and user menu below do
          not.
        */}
        <OutsideSectionMenu>
          <SidebarSection>
            {/*
            Zone 2 — actions. Things you *do*: start a chat, search, check
            notifications. Notifications lived a section below, next to
            Knowledge, which put one action and one destination in a group
            together and left the reader to sort out which was which.
          */}
            {/* The primary action is not one of the rows below it. */}
            <div className="mb-2">
              <ChatButton variant="primary">{t('new-chat')}</ChatButton>
            </div>
            <SearchButton variant="sidebar">
              <MagnifyingGlassIconOutline className="size-5 shrink-0 stroke-muted-foreground" />
              <SidebarLabel className="font-normal">{t('search')}</SidebarLabel>
              <ShortcutHint />
            </SearchButton>
          </SidebarSection>

          <SidebarDivider className="my-2" />

          {/*
          Zone 3 — the library, and the only destinations in the sidebar. Not
          headed: the divider above already separates it from the actions, and
          the "Library" label cost a line the thread list needs on a phone.
          Chats and Assistants used to sit unlabelled at the top of the thread
          list, where they read as two more threads; Knowledge sat above with
          the actions. Three places you can go, named as such.

          Knowledge keeps its org-admin gate. The brief lists it as a plain
          destination, but who may manage a knowledge base is an authorization
          question and not one a redesign gets to answer.
        */}
          <SidebarSection>
            <SidebarItem href="/chats">
              <ChatBubbleLeftIconOutline className="size-5 shrink-0 stroke-muted-foreground" />
              <SidebarLabel className="font-normal">
                {t('nav.chats')}
              </SidebarLabel>
            </SidebarItem>
            <SidebarItem href="/projects">
              <FolderIconOutline className="size-5 shrink-0 stroke-muted-foreground" />
              <SidebarLabel className="font-normal">
                {t('nav.assistants')}
              </SidebarLabel>
            </SidebarItem>
            {/*
            Brain answers to the same test its routes do — the flags, and an
            owner or admin of this organization (or any member, while
            `brainForMembers` is on). Not `userIsOrgAdmin`, which
            also lets a platform admin through: this is the customer's
            knowledge, and a link to a page that 404s is worse than none.
          */}
            {canUseBrain({ role: member?.role, flags: features }) && (
              <SidebarItem href="/brain/overview">
                <LightBulbIconOutline className="size-5 shrink-0 stroke-muted-foreground" />
                <SidebarLabel className="font-normal">
                  {t('nav.brain')}
                </SidebarLabel>
                {/*
                  A brand tint, not `secondary`: that is the sidebar's own
                  paper tint, so the chip read as plain text. In dark mode
                  `text-primary` on the tint measures 2.4:1, hence the
                  stronger tint and light text there (13:1 or better).
                */}
                <Badge
                  variant="outline"
                  className="ml-auto border-transparent bg-primary/10 px-1.5 py-px text-[10px] uppercase tracking-wide text-primary dark:bg-primary/40 dark:text-foreground"
                >
                  {t('nav.brainBeta')}
                </Badge>
              </SidebarItem>
            )}
            {userIsOrgAdmin && (
              <SidebarItem href="/knowledge/documents-list">
                <BookOpenIconOutline className="size-5 shrink-0 stroke-muted-foreground" />
                <SidebarLabel className="font-normal">
                  {t('manage-knowledge')}
                </SidebarLabel>
              </SidebarItem>
            )}
          </SidebarSection>
        </OutsideSectionMenu>
      </SidebarHeader>

      <OutsideSectionMenu>
        <MainSidebarBody />
      </OutsideSectionMenu>
      <SectionSidebarBody
        section="organization"
        titleKey="organization-page.title"
        items={organizationItems}
      />
      <SectionSidebarBody
        section="settings"
        titleKey="settings-page.title"
        items={settingsItems}
      />
      <SidebarFooterMenu
        above={
          <OrganizationSwitcher
            className="min-w-0"
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
      {/* useSearchParams needs a boundary; it renders nothing either way. */}
      <Suspense fallback={null}>
        <RememberLastPage />
      </Suspense>
      <PanelLayoutWrapper
        navbar={navbar}
        sidebar={sidebar}
        showBrain={canUseBrain({ role: member?.role, flags: features })}
      >
        {children}
      </PanelLayoutWrapper>
    </OrgFeaturesProvider>
  );
}
