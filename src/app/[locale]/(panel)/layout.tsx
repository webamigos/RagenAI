import {
  getAccountSetupStatusAction,
  getDefaultProjectPublicId,
} from '@/app/actions';

import { redirect } from '@/i18n/routing';
import { logger } from '@/app/lib/utils/logger';

import { Avatar } from '@ragenai/tui/avatar';
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@ragenai/tui/dropdown';
import {
  Navbar,
  NavbarItem,
  NavbarSection,
  NavbarSpacer,
} from '@ragenai/tui/navbar';
import {
  Sidebar,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@ragenai/tui/sidebar';
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/16/solid';
import { InboxIcon } from '@heroicons/react/20/solid';
import {
  PlusIcon as PlusIconOutline,
  MagnifyingGlassIcon as MagnifyingGlassIconOutline,
} from '@heroicons/react/24/outline';
import { NewSidebarBody } from '@/app/components/Sidebar/NewSidebar/NewSidebarBody';
import { NewSidebarFooter } from '@/app/components/Sidebar/NewSidebar/NewSidebarFooter';
import { SearchButton } from '@/app/components/Sidebar/SearchButton';
import { NewChatButton } from '@/app/components/Sidebar/NewChatButton';
import { PanelLayoutWrapper } from '@/app/components/Layout/PanelLayoutWrapper';
import { getTranslations } from 'next-intl/server';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function PanelLayout({ children }: Props) {
  // Authentication is handled by middleware, no need to check here

  // IMPORTANT: DO NOT call Server Actions in layouts!
  // Server Actions cause re-renders which can lead to infinite loops.
  // Account setup validation has been moved to middleware.

  // Account setup check disabled - was causing infinite loop
  // The layout was calling getAccountSetupStatusAction() which triggered re-renders
  // This has been moved to middleware for lightweight checking
  // TODO: Implement account setup check in middleware if needed

  // Get default project ID disabled - was potentially causing infinite loop
  // Server Actions in layouts can cause re-render loops
  const defaultPublicProjectId: string | undefined = undefined;

  const t = await getTranslations('sidebar');

  const navbar = (
    <Navbar>
      <NavbarSpacer />
      <NavbarSection>
        <SearchButton variant="navbar" aria-label="Search">
          <MagnifyingGlassIconOutline className="w-5 h-5" />
        </SearchButton>
        <NavbarItem href="/inbox" aria-label="Inbox">
          <InboxIcon className="w-5 h-5" />
        </NavbarItem>
        <Dropdown>
          <DropdownButton as={NavbarItem}>
            <Avatar src="/profile-photo.jpg" square />
          </DropdownButton>
          <DropdownMenu className="min-w-64" anchor="bottom end">
            <DropdownItem href="/my-profile">
              <UserIcon className="w-5 h-5" />
              <DropdownLabel>My profile</DropdownLabel>
            </DropdownItem>
            <DropdownItem href="/settings">
              <Cog8ToothIcon className="w-5 h-5" />
              <DropdownLabel>Settings</DropdownLabel>
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem href="/privacy-policy">
              <ShieldCheckIcon className="w-5 h-5" />
              <DropdownLabel>Privacy policy</DropdownLabel>
            </DropdownItem>
            <DropdownItem href="/share-feedback">
              <LightBulbIcon className="w-5 h-5" />
              <DropdownLabel>Share feedback</DropdownLabel>
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem href="/logout">
              <ArrowRightStartOnRectangleIcon className="w-5 h-5" />
              <DropdownLabel>Sign out</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </NavbarSection>
    </Navbar>
  );

  const sidebar = (
    <Sidebar>
      <SidebarHeader>
        <SidebarSection className="max-lg:hidden">
          <NewChatButton variant="sidebar">
            <PlusIconOutline className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
            <SidebarLabel className="font-normal">{t('new-chat')}</SidebarLabel>
          </NewChatButton>
          <SearchButton variant="sidebar">
            <MagnifyingGlassIconOutline className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
            <SidebarLabel className="font-normal">Search</SidebarLabel>
          </SearchButton>
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
