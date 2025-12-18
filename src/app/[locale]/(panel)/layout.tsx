import {
  getAccountSetupStatusAction,
  getDefaultProjectPublicId,
} from '@/app/actions';

import { redirect } from 'next/navigation';
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
  PlusIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/16/solid';
import { InboxIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
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
  // This avoids Clerk v6 + Next.js 15 Server Actions middleware detection issues

  // Account setup check - only validate on initial page load (GET requests)
  // Skip validation during Server Actions (POST) due to Clerk v6 + Next.js 15 middleware detection issues
  try {
    const status = await getAccountSetupStatusAction();
    if (!status.accountSetupComplete) {
      logger.error({ status }, 'Account misconfiguration detected');
      redirect('/account-configuration?misconfigurationDetected=true');
    }
  } catch (error) {
    // During Server Actions, Clerk can't detect middleware
    // Skip validation in this case - middleware already protects the route
    logger.warn(
      { err: error },
      'Skipping account setup validation (likely Server Action context)'
    );
  }

  // Get default project ID - may fail during Server Actions
  let defaultPublicProjectId: string | undefined;
  try {
    defaultPublicProjectId = (await getDefaultProjectPublicId()) ?? undefined;
  } catch (error) {
    logger.warn(
      { err: error },
      'Could not get default project ID (likely Server Action context)'
    );
    // Continue without default project ID - not critical for layout rendering
  }

  const t = await getTranslations('sidebar');

  const navbar = (
    <Navbar>
      <NavbarSpacer />
      <NavbarSection>
        <SearchButton variant="navbar" aria-label="Search">
          <MagnifyingGlassIcon className="w-5 h-5" />
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
            <PlusIcon className="w-6 h-6" />
            <SidebarLabel>{t('new-chat')}</SidebarLabel>
          </NewChatButton>
          <SearchButton variant="sidebar">
            <MagnifyingGlassIcon className="w-6 h-6" />
            <SidebarLabel>Search</SidebarLabel>
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
