'use client';

import {
  PlusIcon,
  MagnifyingGlassIcon,
  ChatBubbleLeftIcon,
  FolderIcon,
} from '@heroicons/react/24/outline';
import { useSidebarCollapse } from '@ragenai/tui/sidebar-layout';
import { useUser } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { usePathname } from '@/i18n/routing';
import { useLocale } from 'next-intl';
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
  ArrowRightStartOnRectangleIcon,
  Cog8ToothIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

function ExpandIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-5"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const iconButtonClass =
  'flex items-center justify-center size-9 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors';

const activeIconButtonClass =
  'flex items-center justify-center size-9 rounded-lg bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-white transition-colors';

export const CollapsedSidebarRail = () => {
  const { toggle } = useSidebarCollapse();
  const { user } = useUser();
  const { openSearch } = useSearchThreads();
  const pathname = usePathname();
  const t = useTranslations('sidebar.footer');
  const locale = useLocale();

  const isChatsActive = pathname === '/chats' || pathname.startsWith('/chats/');
  const isProjectsActive =
    pathname === '/projects' || pathname.startsWith('/projects/');

  return (
    <div className="flex h-full flex-col items-center py-3 gap-1 bg-white dark:bg-zinc-900 border-r border-zinc-950/5 dark:border-white/5">
      <button
        type="button"
        onClick={toggle}
        className={iconButtonClass}
        aria-label="Open sidebar"
      >
        <ExpandIcon />
      </button>

      <Link href="/new" className={iconButtonClass} aria-label="New chat">
        <PlusIcon className="size-5" />
      </Link>

      <button
        type="button"
        onClick={openSearch}
        className={iconButtonClass}
        aria-label="Search"
      >
        <MagnifyingGlassIcon className="size-5" />
      </button>

      <div className="my-1 w-6 border-t border-zinc-950/5 dark:border-white/5" />

      <Link
        href="/chats"
        className={isChatsActive ? activeIconButtonClass : iconButtonClass}
        aria-label="Chats"
      >
        <ChatBubbleLeftIcon className="size-5" />
      </Link>

      <Link
        href="/projects"
        className={isProjectsActive ? activeIconButtonClass : iconButtonClass}
        aria-label="Projects"
      >
        <FolderIcon className="size-5" />
      </Link>

      <div className="flex-1" />

      <Dropdown>
        <DropdownButton
          as="button"
          className="flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors p-0.5"
          aria-label="User menu"
        >
          <Avatar
            src={user?.image}
            initials={
              user?.image
                ? undefined
                : (user?.name || user?.email || '?')[0].toUpperCase()
            }
            className="size-8 bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            square
            alt="user avatar"
          />
        </DropdownButton>
        <DropdownMenu className="min-w-48" anchor="right start">
          <DropdownItem href="/user/profile">
            <UserIcon className="size-4 mr-2 text-zinc-500 dark:text-zinc-400 shrink-0" />
            <DropdownLabel>{t('my-profile')}</DropdownLabel>
          </DropdownItem>
          <DropdownItem href="/settings">
            <Cog8ToothIcon className="size-4 mr-2 text-zinc-500 dark:text-zinc-400 shrink-0" />
            <DropdownLabel>{t('settings')}</DropdownLabel>
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem
            onClick={async () => {
              await signOut();
              window.location.href = `/${locale}/sign-in`;
            }}
          >
            <ArrowRightStartOnRectangleIcon className="size-4 mr-2 text-zinc-500 dark:text-zinc-400 shrink-0" />
            <DropdownLabel>{t('sign-out')}</DropdownLabel>
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
    </div>
  );
};
