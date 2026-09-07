'use client';

import type { ReactNode } from 'react';
import { useUser, useOrganization } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';

import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@ragenai/tui/dropdown';
import { SidebarFooter, SidebarItem } from '@ragenai/tui/sidebar';
import {
  ArrowRightStartOnRectangleIcon,
  BuildingOfficeIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  CpuChipIcon,
  CircleStackIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import { useTranslations, useLocale } from 'next-intl';
import { useMobileSidebar } from '@ragenai/tui/sidebar-layout';
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

type Props = {
  /**
   * Rendered above the account menu, inside the footer's rule.
   *
   * The organization switcher lives here rather than at the top of the
   * sidebar. It is a context indicator you change rarely, not a destination,
   * and at the top it competed with the one action the sidebar exists for.
   */
  contextSlot?: ReactNode;
};

export const SidebarFooterMenu = ({ contextSlot }: Props) => {
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
      {contextSlot}
      <Dropdown>
        <DropdownButton as={SidebarItem} data-testid="user-menu">
          <span className="flex min-w-0 items-center gap-3">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt="user avatar"
                referrerPolicy="no-referrer"
                className="size-9 rounded-lg object-cover"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground">
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
        </DropdownButton>
        <DropdownMenu className="min-w-64" anchor="top start">
          <DropdownItem disabled className="opacity-100">
            <DropdownLabel className="col-start-1 col-span-full text-xs text-muted-foreground truncate">
              {user?.email}
            </DropdownLabel>
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem href="/settings" onClick={closeSidebar}>
            <Cog8ToothIcon
              data-slot="icon"
              className="size-5 sm:size-4 mr-3 text-muted-foreground shrink-0"
            />
            <DropdownLabel>{t('settings')}</DropdownLabel>
          </DropdownItem>
          <DropdownItem href="/support" onClick={closeSidebar}>
            <QuestionMarkCircleIcon
              data-slot="icon"
              className="size-5 sm:size-4 mr-3 text-muted-foreground shrink-0"
            />
            <DropdownLabel>{t('support')}</DropdownLabel>
          </DropdownItem>
          {showAdminTools && (
            <>
              <DropdownDivider />
              <DropdownItem disabled className="opacity-100">
                <DropdownLabel className="col-start-1 col-span-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('admin-tools')}
                </DropdownLabel>
              </DropdownItem>
              <DropdownItem
                href="/organization/assistant-settings"
                onClick={closeSidebar}
              >
                <BuildingOfficeIcon
                  data-slot="icon"
                  className="size-5 sm:size-4 mr-3 text-muted-foreground shrink-0"
                />
                <DropdownLabel>{t('organization')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem
                href="/organization/ai-usage"
                onClick={closeSidebar}
              >
                <CpuChipIcon
                  data-slot="icon"
                  className="size-5 sm:size-4 mr-3 text-muted-foreground shrink-0"
                />
                <DropdownLabel>{t('ai-usage')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem
                href="/organization/disk-usage"
                onClick={closeSidebar}
              >
                <CircleStackIcon
                  data-slot="icon"
                  className="size-5 sm:size-4 mr-3 text-muted-foreground shrink-0"
                />
                <DropdownLabel>{t('disk-usage')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem
                href="/organization/audit-logs"
                onClick={closeSidebar}
              >
                <DocumentTextIcon
                  data-slot="icon"
                  className="size-5 sm:size-4 mr-3 text-muted-foreground shrink-0"
                />
                <DropdownLabel>{t('audit-logs')}</DropdownLabel>
              </DropdownItem>
            </>
          )}
          <DropdownDivider />
          <DropdownItem
            onClick={async () => {
              await signOut();
              hardNavigate(locale, '/sign-in');
            }}
          >
            <ArrowRightStartOnRectangleIcon
              data-slot="icon"
              className="size-5 sm:size-4 mr-3 text-muted-foreground shrink-0"
            />
            <DropdownLabel>{t('sign-out')}</DropdownLabel>
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </SidebarFooter>
  );
};
