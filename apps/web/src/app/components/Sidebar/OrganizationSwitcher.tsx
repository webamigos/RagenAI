'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarItem, SidebarLabel } from '@ragenai/common-ui/Sidebar';
import { BuildingOfficeIcon } from '@heroicons/react/24/outline';
import {
  ChevronsUpDownIcon,
  Building2Icon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react';
import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { authClient } from '@/app/hooks/use-better-auth';
import { switchOrganizationCommand } from '@/features/organizations/services/commands/switch-organization-command';

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
  const [, startTransition] = useTransition();

  const activeOrg = organizations.find(
    (org) => org.id === activeOrganizationId,
  );
  const otherOrgs = organizations.filter(
    (org) => org.id !== activeOrganizationId,
  );

  const handleSwitchOrg = (organizationId: string) => {
    if (organizationId === activeOrganizationId) {
      return;
    }

    startTransition(async () => {
      try {
        await authClient.organization.setActive({ organizationId });
        await switchOrganizationCommand(organizationId);
        router.push('/new');
      } catch {
        // Silently handled — page state remains unchanged
      }
    });
  };

  if (!isAppAdmin) {
    return (
      <SidebarItem className="cursor-default">
        <BuildingOfficeIcon className="size-5 shrink-0 stroke-muted-foreground" />
        <SidebarLabel className="font-semibold truncate">
          {activeOrg?.name ?? t('manage-organization')}
        </SidebarLabel>
      </SidebarItem>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarItem>
          <BuildingOfficeIcon className="size-5 shrink-0 stroke-muted-foreground" />
          <SidebarLabel className="font-semibold truncate">
            {activeOrg?.name ?? t('manage-organization')}
          </SidebarLabel>
          <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </SidebarItem>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-56">
        {otherOrgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => handleSwitchOrg(org.id)}
          >
            <Building2Icon />
            {org.name}
          </DropdownMenuItem>
        ))}

        {otherOrgs.length > 0 && <DropdownMenuSeparator />}

        <DropdownMenuItem asChild>
          <Link href="/organization/profile">
            <SettingsIcon />
            {t('organization-settings')}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/settings/create-organization">
            <PlusIcon />
            {t('create-organization')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
