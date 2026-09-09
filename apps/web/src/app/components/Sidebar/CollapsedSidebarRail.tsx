'use client';

import {
  PlusIcon,
  MagnifyingGlassIcon,
  ChatBubbleLeftIcon,
  FolderIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import { useSidebarCollapse } from '@ragenai/common-ui/SidebarLayout';
import { useUser, useOrganization } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';
import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { usePathname } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowRightStartOnRectangleIcon,
  Cog8ToothIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { hardNavigate } from '@/libs/navigation/hard-navigate';

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
  'flex items-center justify-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors';

const activeIconButtonClass =
  'flex items-center justify-center size-9 rounded-lg bg-accent text-accent-foreground transition-colors';

export const CollapsedSidebarRail = () => {
  const { toggle } = useSidebarCollapse();
  const { user } = useUser();
  const { canManageOrg } = useOrganization();
  const { openSearch } = useSearchThreads();
  const pathname = usePathname();
  const t = useTranslations('sidebar.footer');
  const tSidebar = useTranslations('sidebar');
  const locale = useLocale();

  const isChatsActive = pathname === '/chats' || pathname.startsWith('/chats/');
  const isProjectsActive =
    pathname === '/projects' || pathname.startsWith('/projects/');
  const isKnowledgeActive = pathname.startsWith('/knowledge');

  return (
    <div className="flex h-full flex-col items-center py-3 gap-1 bg-sidebar border-r border-sidebar-border">
      <button
        type="button"
        onClick={toggle}
        className={iconButtonClass}
        aria-label={tSidebar('toggle-sidebar')}
      >
        <ExpandIcon />
      </button>

      <Link
        href="/new"
        className={iconButtonClass}
        aria-label={tSidebar('new-chat')}
      >
        <PlusIcon className="size-5" />
      </Link>

      <button
        type="button"
        onClick={openSearch}
        className={iconButtonClass}
        aria-label={tSidebar('search')}
      >
        <MagnifyingGlassIcon className="size-5" />
      </button>

      <div className="my-1 w-6 border-t border-sidebar-border" />

      <Link
        href="/chats"
        className={isChatsActive ? activeIconButtonClass : iconButtonClass}
        aria-label={tSidebar('nav.chats')}
      >
        <ChatBubbleLeftIcon className="size-5" />
      </Link>

      <Link
        href="/projects"
        className={isProjectsActive ? activeIconButtonClass : iconButtonClass}
        aria-label={tSidebar('nav.assistants')}
      >
        <FolderIcon className="size-5" />
      </Link>

      {/*
        Library is Chats, Assistants and Knowledge in the expanded sidebar; the
        rail had the first two. Collapsing the sidebar should hide the labels,
        not a destination.

        Gated on `canManageOrg`, exactly as the expanded item is. The rail is a
        second rendering of the same navigation, so a permission applied in one
        and forgotten in the other is how a hidden destination becomes a
        visible one for everybody.
      */}
      {canManageOrg && (
        <Link
          href="/knowledge/documents-list"
          className={
            isKnowledgeActive ? activeIconButtonClass : iconButtonClass
          }
          aria-label={tSidebar('manage-knowledge')}
        >
          <BookOpenIcon className="size-5" />
        </Link>
      )}

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center justify-center rounded-lg p-0.5 transition-colors hover:bg-accent"
          aria-label={tSidebar('user-menu')}
          data-testid="user-menu"
        >
          {/*
            shadcn's Avatar is compositional where tui's took `src`/`initials`
            and chose between them internally. AvatarFallback already renders
            only when the image is absent or fails, so the ternary that guarded
            `initials` is gone rather than translated — it was working around
            the older component, not expressing anything.

            `rounded-md` stands in for tui's `square`: shadcn's base is a
            circle, and this avatar sits in a rail of square-ish icon buttons.
          */}
          <Avatar className="size-8 rounded-md">
            <AvatarImage src={user?.image ?? undefined} alt="user avatar" />
            <AvatarFallback className="rounded-md bg-secondary text-secondary-foreground">
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="min-w-48">
          <DropdownMenuItem asChild>
            <Link href="/user/profile">
              <UserIcon className="size-4 shrink-0 text-muted-foreground" />
              {t('my-profile')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Cog8ToothIcon className="size-4 shrink-0 text-muted-foreground" />
              {t('settings')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              hardNavigate(locale, '/sign-in');
            }}
          >
            <ArrowRightStartOnRectangleIcon className="size-4 shrink-0 text-muted-foreground" />
            {t('sign-out')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
