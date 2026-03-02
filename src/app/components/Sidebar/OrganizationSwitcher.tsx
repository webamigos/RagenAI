'use client';

import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownDivider,
  DropdownLabel,
} from '@ragenai/tui/dropdown';
import { SidebarItem, SidebarLabel } from '@ragenai/tui/sidebar';
import {
  ChevronUpDownIcon,
  BuildingOfficeIcon,
  PlusIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { switchOrganizationAction } from '@/app/actions/index';
import { authClient } from '@/app/hooks/use-better-auth';

type Organization = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
};

type Props = {
  organizations: Organization[];
  activeOrganizationId: string | null;
  isAppAdmin: boolean;
};

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  isAppAdmin,
}: Props) {
  const t = useTranslations('sidebar');
  const router = useRouter();

  const activeOrg = organizations.find(
    (org) => org.id === activeOrganizationId,
  );
  const otherOrgs = organizations.filter(
    (org) => org.id !== activeOrganizationId,
  );

  const handleSwitchOrg = async (organizationId: string) => {
    if (organizationId === activeOrganizationId) {
      return;
    }

    await switchOrganizationAction(organizationId);
    await authClient.organization.setActive({ organizationId });
    router.refresh();
  };

  if (!isAppAdmin) {
    return (
      <SidebarItem className="cursor-default">
        <BuildingOfficeIcon className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
        <SidebarLabel className="font-semibold truncate">
          {activeOrg?.name ?? t('manage-organization')}
        </SidebarLabel>
      </SidebarItem>
    );
  }

  return (
    <Dropdown>
      <DropdownButton as={SidebarItem}>
        <BuildingOfficeIcon className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
        <SidebarLabel className="font-semibold truncate">
          {activeOrg?.name ?? t('manage-organization')}
        </SidebarLabel>
        <ChevronUpDownIcon className="ml-auto size-4 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
      </DropdownButton>

      <DropdownMenu
        anchor="bottom start"
        className="min-w-[var(--button-width)]"
      >
        {otherOrgs.map((org) => (
          <DropdownItem key={org.id} onClick={() => handleSwitchOrg(org.id)}>
            <BuildingOfficeIcon className="size-4" />
            <DropdownLabel>{org.name}</DropdownLabel>
          </DropdownItem>
        ))}

        {otherOrgs.length > 0 && <DropdownDivider />}

        <DropdownItem href="/settings/organization-profile">
          <Cog6ToothIcon className="size-4" />
          <DropdownLabel>{t('manage-organization')}</DropdownLabel>
        </DropdownItem>

        <DropdownItem href="/settings/create-organization">
          <PlusIcon className="size-4" />
          <DropdownLabel>{t('create-organization')}</DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
