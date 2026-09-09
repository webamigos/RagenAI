'use client';

import { useUser, useOrganization } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from '@/i18n/routing';
import { SidebarFooter, SidebarItem } from '@ragenai/common-ui/Sidebar';
import {
  ArrowRightStartOnRectangleIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  CpuChipIcon,
  CircleStackIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import { useTranslations, useLocale } from 'next-intl';
import { useMobileSidebar } from '@ragenai/common-ui/SidebarLayout';
import { hardNavigate } from '@/libs/navigation/hard-navigate';

function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) {
    return '?';
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
}

/**
 * `above` is the organization switcher, handed down from the panel layout
 * rather than rendered here: it needs the org list and the active id, and
 * those are fetched in the server component. Passing the element keeps the
 * fetching there and the placement here.
 */
export const SidebarFooterMenu = ({
  above,
}: {
  above?: React.ReactNode;
} = {}) => {
  const { user, isAppAdmin } = useUser();
  const { canManageOrg } = useOrganization();
  const t = useTranslations('sidebar.footer');
  const locale = useLocale();
  const { closeSidebar } = useMobileSidebar();
  const userAvatar = user?.image;
  const userName = user?.name;
  const initials = getInitials(userName);
  const showAdminTools = isAppAdmin || canManageOrg;

  let roleLabel = t('role-user');
  if (isAppAdmin) {
    roleLabel = t('role-app-admin');
  } else if (canManageOrg) {
    roleLabel = t('role-org-admin');
  }

  return (
    <SidebarFooter>
      {/*
        Zone 5. Which organization you are in, then who you are — the two
        pieces of "where am I signed in", together and pinned, instead of the
        switcher living at the top where it read as a page title.
      */}
      {above}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarItem data-testid="user-menu">
            <span className="flex min-w-0 items-center gap-3">
              {/*
                Both carry an edge. The initials fall back to `bg-secondary`,
                which is L 96.7 against a sidebar at L 98.6 — **1.9 apart**, so
                in light mode the avatar simply was not there. Dark was fine at
                10.2 apart, which is why it only ever looked broken in one
                theme. A photo needs the edge too: a light one vanishes the
                same way.
              */}
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt="user avatar"
                  referrerPolicy="no-referrer"
                  className="size-9 rounded-lg border border-border object-cover"
                />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-sm font-semibold text-secondary-foreground">
                  {initials}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm/5 font-medium text-foreground">
                  {userName}
                </span>
                <span className="block truncate text-xs/5 font-normal text-muted-foreground">
                  {roleLabel}
                </span>
              </span>
            </span>
            <ChevronUpIcon className="ml-auto size-4 shrink-0 stroke-muted-foreground" />
          </SidebarItem>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-64">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
            {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings" onClick={closeSidebar}>
              <Cog8ToothIcon className="size-5 shrink-0 text-muted-foreground sm:size-4" />
              {t('settings')}
            </Link>
          </DropdownMenuItem>
          {showAdminTools && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t('admin-tools')}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link
                  href="/organization/assistant-settings"
                  onClick={closeSidebar}
                >
                  <BuildingOfficeIcon className="size-5 shrink-0 text-muted-foreground sm:size-4" />
                  {t('organization')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/organization/ai-usage" onClick={closeSidebar}>
                  <CpuChipIcon className="size-5 shrink-0 text-muted-foreground sm:size-4" />
                  {t('ai-usage')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/organization/disk-usage" onClick={closeSidebar}>
                  <CircleStackIcon className="size-5 shrink-0 text-muted-foreground sm:size-4" />
                  {t('disk-usage')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/organization/audit-logs" onClick={closeSidebar}>
                  <DocumentTextIcon className="size-5 shrink-0 text-muted-foreground sm:size-4" />
                  {t('audit-logs')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/organization/knowledge-analytics"
                  onClick={closeSidebar}
                >
                  <ChartBarIcon className="size-5 shrink-0 text-muted-foreground sm:size-4" />
                  {t('knowledge-analytics')}
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              hardNavigate(locale, '/sign-in');
            }}
          >
            <ArrowRightStartOnRectangleIcon className="size-5 shrink-0 text-muted-foreground sm:size-4" />
            {t('sign-out')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  );
};
