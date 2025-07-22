import {
  SidebarBody,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@ragenai/tui/sidebar';
import {
  Cog6ToothIcon,
  HomeIcon,
  MegaphoneIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  Square2StackIcon,
  TicketIcon,
} from '@heroicons/react/20/solid';

export const NewMainSidebarBody = () => {
  return (
    <SidebarBody>
      <SidebarSection>
        <SidebarItem href="/">
          <HomeIcon className="w-5 h-5" />
          <SidebarLabel>Home</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/events">
          <Square2StackIcon className="w-5 h-5" />
          <SidebarLabel>Events</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/orders">
          <TicketIcon className="w-5 h-5" />
          <SidebarLabel>Orders</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings">
          <Cog6ToothIcon className="w-5 h-5" />
          <SidebarLabel>Settings</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/broadcasts">
          <MegaphoneIcon className="w-5 h-5" />
          <SidebarLabel>Broadcasts</SidebarLabel>
        </SidebarItem>
      </SidebarSection>
      <SidebarSection className="max-lg:hidden">
        <SidebarHeading>Upcoming Events</SidebarHeading>
        <SidebarItem href="/events/1">Bear Hug: Live in Concert</SidebarItem>
        <SidebarItem href="/events/2">Viking People</SidebarItem>
        <SidebarItem href="/events/3">Six Fingers — DJ Set</SidebarItem>
        <SidebarItem href="/events/4">We All Look The Same</SidebarItem>
      </SidebarSection>
      <SidebarSpacer />
      <SidebarSection>
        <SidebarItem href="/support">
          <QuestionMarkCircleIcon className="w-5 h-5" />
          <SidebarLabel>Support</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/changelog">
          <SparklesIcon className="w-5 h-5" />
          <SidebarLabel>Changelog</SidebarLabel>
        </SidebarItem>
      </SidebarSection>
    </SidebarBody>
  );
};
