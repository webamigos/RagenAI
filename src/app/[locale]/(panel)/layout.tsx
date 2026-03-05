export const dynamic = 'force-dynamic';

import { Navbar, NavbarSection, NavbarSpacer } from '@ragenai/tui/navbar';
import {
  Sidebar,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@ragenai/tui/sidebar';
import {
  PlusIcon as PlusIconOutline,
  MagnifyingGlassIcon as MagnifyingGlassIconOutline,
  BookOpenIcon as BookOpenIconOutline,
} from '@heroicons/react/24/outline';
import { NewSidebarBody } from '@/app/components/Sidebar/NewSidebar/NewSidebarBody';
import { NewSidebarFooter } from '@/app/components/Sidebar/NewSidebar/NewSidebarFooter';
import { SearchButton } from '@/app/components/Sidebar/SearchButton';
import { NewChatButton } from '@/app/components/Sidebar/NewChatButton';
import { SidebarToggleButton } from '@/app/components/Sidebar/SidebarToggleButton';
import { PanelLayoutWrapper } from '@/app/components/Layout/PanelLayoutWrapper';
import { getTranslations } from 'next-intl/server';
import { OrganizationSwitcher } from '@/app/components/Sidebar/OrganizationSwitcher';
import { getUserOrganizationsQuery } from '@/features/organizations/services/queries/get-user-organizations-query';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { isAppAdmin } from '@/lib/auth-access-control';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function PanelLayout({ children }: Props) {
  const [t, user, activeOrgId, organizations] = await Promise.all([
    getTranslations('sidebar'),
    getCurrentUser(),
    getOrgIdFromAuth(),
    getUserOrganizationsQuery(),
  ]);

  const navbar = (
    <Navbar>
      <NavbarSpacer />
      <NavbarSection>
        <SearchButton variant="navbar" aria-label="Search">
          <MagnifyingGlassIconOutline className="w-5 h-5" />
        </SearchButton>
      </NavbarSection>
    </Navbar>
  );

  const sidebar = (
    <Sidebar>
      <SidebarHeader>
        <SidebarSection className="max-lg:hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-zinc-950 dark:text-white">
              Ragen
            </span>
            <SidebarToggleButton />
          </div>
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrgId}
            isAppAdmin={isAppAdmin(user)}
          />
          <NewChatButton variant="sidebar">
            <PlusIconOutline className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
            <SidebarLabel className="font-normal">{t('new-chat')}</SidebarLabel>
          </NewChatButton>
          <SearchButton variant="sidebar">
            <MagnifyingGlassIconOutline className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
            <SidebarLabel className="font-normal">{t('search')}</SidebarLabel>
          </SearchButton>
          <SidebarItem href="/knowledge/documents-list">
            <BookOpenIconOutline className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
            <SidebarLabel className="font-normal">
              {t('manage-knowledge')}
            </SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarHeader>

      <NewSidebarBody />
      <NewSidebarFooter />
    </Sidebar>
  );

  return (
    <PanelLayoutWrapper navbar={navbar} sidebar={sidebar}>
      {children}
    </PanelLayoutWrapper>
  );
}
