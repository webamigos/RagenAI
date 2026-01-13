'use client';

import { useUser } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';

import { Avatar } from '@ragenai/tui/avatar';
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
  ChevronUpIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/16/solid';
import { useTranslations, useLocale } from 'next-intl';

export const NewSidebarFooter = () => {
  const { user } = useUser();
  const t = useTranslations('sidebar.footer');
  const locale = useLocale();
  const userAvatar = user?.image;
  const userEmail = user?.email; // Better Auth: email is a direct string property
  const userFirstName = user?.name; // Better Auth: uses 'name' instead of 'firstName'

  return (
    <SidebarFooter>
      <Dropdown>
        <DropdownButton as={SidebarItem}>
          <span className="flex min-w-0 items-center gap-3">
            <Avatar
              src={userAvatar}
              className="size-10"
              square
              alt="user avatar"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                {userFirstName}
              </span>
              <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                {userEmail}
              </span>
            </span>
          </span>
          <ChevronUpIcon className="w-5 h-5" />
        </DropdownButton>
        <DropdownMenu className="min-w-64" anchor="top start">
          <DropdownItem href="/user/profile">
            <UserIcon className="w-6 h-6" />
            <DropdownLabel>{t('my-profile')}</DropdownLabel>
          </DropdownItem>
          <DropdownItem href="/settings">
            <Cog8ToothIcon className="w-6 h-6" />
            <DropdownLabel>{t('settings')}</DropdownLabel>
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem
            onClick={async () => {
              await signOut();
              window.location.href = `/${locale}/sign-in`;
            }}
          >
            <ArrowRightStartOnRectangleIcon className="w-6 h-6 mr-2" />
            <DropdownLabel>{t('sign-out')}</DropdownLabel>
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </SidebarFooter>
  );
};
