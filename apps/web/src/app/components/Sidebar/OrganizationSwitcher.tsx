'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarItem, SidebarLabel } from '@ragenai/common-ui/Sidebar';
import { BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { ChevronsUpDownIcon, PlusIcon, SettingsIcon } from 'lucide-react';
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
  /**
   * Applied to the item's wrapper. The header places this beside the collapse
   * button, so the caller hands in `min-w-0 flex-1` and the button keeps its
   * own width — the same split shadcn's `TeamSwitcher` relies on inside
   * `SidebarHeader`.
   */
  className?: string;
};

/**
 * The organization the sidebar is showing, at the top of it.
 *
 * Shaped after shadcn's sidebar `TeamSwitcher`: a square tile, the name, and a
 * chevron only when there is something to switch to. It replaced the "Ragen"
 * wordmark rather than sitting under it — the product name is in the browser
 * tab and on the sign-in page, and what a person opening the panel needs to
 * know is *which organization* they are looking at, which used to be answered
 * only in the footer.
 */
export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  isAppAdmin,
  className,
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
  const activeName = activeOrg?.name ?? t('manage-organization');

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

  const tile = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
      <BuildingOfficeIcon className="size-4" aria-hidden="true" />
    </span>
  );

  if (!isAppAdmin) {
    return (
      <SidebarItem className={className} aria-label={activeName}>
        {tile}
        <SidebarLabel className="font-semibold">{activeName}</SidebarLabel>
      </SidebarItem>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarItem className={className} aria-label={activeName}>
          {tile}
          <SidebarLabel className="font-semibold">{activeName}</SidebarLabel>
          <ChevronsUpDownIcon
            className="ml-auto size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </SidebarItem>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="bottom" className="min-w-56">
        {otherOrgs.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t('switch-organization')}
            </DropdownMenuLabel>
            {otherOrgs.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onSelect={() => handleSwitchOrg(org.id)}
              >
                <BuildingOfficeIcon className="size-4" aria-hidden="true" />
                {org.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}

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
