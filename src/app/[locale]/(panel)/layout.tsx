import { auth } from '@clerk/nextjs/server';

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
import { SidebarLayout } from '@ragenai/tui/sidebar-layout';
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

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function PanelLayout({ children }: Props) {
  const { sessionClaims } = auth();
  const membership = sessionClaims?.membership;
  const status = await getAccountSetupStatusAction();
  if (!status.accountSetupComplete) {
    logger.error({ status }, 'Account misconfiguration detected');
    redirect('/account-configuration?misconfigurationDetected=true');
  }
  const defaultPublicProjectId = await getDefaultProjectPublicId();

  return (
    // <>

    //   <div className="h-screen flex flex-col">
    //     <Sidebar defaultPublicProjectId={defaultPublicProjectId}>
    //       {children}
    //     </Sidebar>
    //   </div>
    //   <Toast />
    // </>

    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <NavbarItem href="/search" aria-label="Search">
              <MagnifyingGlassIcon className="w-5 h-5" />
            </NavbarItem>
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
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <Dropdown>
              <DropdownButton as={SidebarItem} className="lg:mb-2.5">
                <Avatar src="/tailwind-logo.svg" />
                <SidebarLabel>Tailwind Labs</SidebarLabel>
                <ChevronDownIcon className="w-6 h-6" />
              </DropdownButton>
              <DropdownMenu
                className="min-w-80 lg:min-w-64"
                anchor="bottom start"
              >
                <DropdownItem href="/teams/1/settings">
                  <Cog8ToothIcon className="w-6 h-6" />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/teams/1">
                  <Avatar
                    slot="icon"
                    src="/tailwind-logo.svg"
                    className="w-6 h-6"
                  />
                  <DropdownLabel>Tailwind Labs</DropdownLabel>
                </DropdownItem>
                <DropdownItem href="/teams/2">
                  <Avatar
                    slot="icon"
                    initials="WC"
                    className="bg-purple-500 text-white"
                  />
                  <DropdownLabel>Workcation</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/teams/create">
                  <PlusIcon className="w-6 h-6" />
                  <DropdownLabel>New team&hellip;</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
            <SidebarSection className="max-lg:hidden">
              <SidebarItem href="/search">
                <MagnifyingGlassIcon className="w-6 h-6" />
                <SidebarLabel>Search</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/inbox">
                <InboxIcon className="w-6 h-6" />
                <SidebarLabel>Inbox</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarHeader>

          <NewSidebarBody />
          <NewSidebarFooter />
        </Sidebar>
      }
    >
      {/* The page content */}
      {children}
    </SidebarLayout>
  );
}
