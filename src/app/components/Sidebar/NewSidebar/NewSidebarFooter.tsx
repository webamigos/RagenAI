'use client';

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

export const NewSidebarFooter = () => {
  const { user, isAppAdmin } = useUser();
  const { isOrgAdmin } = useOrganization();
  const t = useTranslations('sidebar.footer');
  const locale = useLocale();
  const userAvatar = user?.image;
  const userName = user?.name;
  const initials = getInitials(userName);
  const showAdminTools = isAppAdmin || isOrgAdmin;

  let roleLabel = t('role-user');
  if (isAppAdmin) {
    roleLabel = t('role-app-admin');
  } else if (isOrgAdmin) {
    roleLabel = t('role-org-admin');
  }

  return (
    <SidebarFooter>
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
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-sm font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                {initials}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                {userName}
              </span>
              <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                {roleLabel}
              </span>
            </span>
          </span>
          <ChevronUpIcon className="ml-auto size-4 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
        </DropdownButton>
        <DropdownMenu className="min-w-64" anchor="top start">
          <DropdownItem disabled className="opacity-100">
            <DropdownLabel className="col-start-1 col-span-full text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {user?.email}
            </DropdownLabel>
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem href="/settings">
            <Cog8ToothIcon
              data-slot="icon"
              className="size-5 sm:size-4 mr-3 text-zinc-500 dark:text-zinc-400 shrink-0"
            />
            <DropdownLabel>{t('settings')}</DropdownLabel>
          </DropdownItem>
          <DropdownItem href="/support">
            <QuestionMarkCircleIcon
              data-slot="icon"
              className="size-5 sm:size-4 mr-3 text-zinc-500 dark:text-zinc-400 shrink-0"
            />
            <DropdownLabel>{t('support')}</DropdownLabel>
          </DropdownItem>
          {showAdminTools && (
            <>
              <DropdownDivider />
              <DropdownItem disabled className="opacity-100">
                <DropdownLabel className="col-start-1 col-span-full text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('admin-tools')}
                </DropdownLabel>
              </DropdownItem>
              <DropdownItem href="/organization/assistant-settings">
                <BuildingOfficeIcon
                  data-slot="icon"
                  className="size-5 sm:size-4 mr-3 text-zinc-500 dark:text-zinc-400 shrink-0"
                />
                <DropdownLabel>{t('organization')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem href="/organization/ai-usage">
                <CpuChipIcon
                  data-slot="icon"
                  className="size-5 sm:size-4 mr-3 text-zinc-500 dark:text-zinc-400 shrink-0"
                />
                <DropdownLabel>{t('ai-usage')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem href="/organization/disk-usage">
                <CircleStackIcon
                  data-slot="icon"
                  className="size-5 sm:size-4 mr-3 text-zinc-500 dark:text-zinc-400 shrink-0"
                />
                <DropdownLabel>{t('disk-usage')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem href="/organization/audit-logs">
                <DocumentTextIcon
                  data-slot="icon"
                  className="size-5 sm:size-4 mr-3 text-zinc-500 dark:text-zinc-400 shrink-0"
                />
                <DropdownLabel>{t('audit-logs')}</DropdownLabel>
              </DropdownItem>
            </>
          )}
          <DropdownDivider />
          <DropdownItem
            onClick={async () => {
              await signOut();
              window.location.href = `/${locale}/sign-in`;
            }}
          >
            <ArrowRightStartOnRectangleIcon
              data-slot="icon"
              className="size-5 sm:size-4 mr-3 text-zinc-500 dark:text-zinc-400 shrink-0"
            />
            <DropdownLabel>{t('sign-out')}</DropdownLabel>
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </SidebarFooter>
  );
};
