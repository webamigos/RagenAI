'use client';

import {
  SidebarBody,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarDivider,
} from '@ragenai/tui/sidebar';
import { ChatBubbleLeftIcon, FolderIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';

import { useSidebar } from '@/app/hooks/useSidebar';
import { useSidebarThreads } from './useSidebarThreads';
import { SidebarThreadItem } from './SidebarThreadItem';

export const NewMainSidebarBody = () => {
  const pathname = usePathname();
  const t = useTranslations('sidebar');
  const { closeSidebar } = useSidebar();

  const {
    starredThreads,
    recentThreads,
    sharedThreads,
    isLoading,
    hasMore,
    loadMore,
    toggleStar,
    renameThread,
    removeThread,
  } = useSidebarThreads();

  const activeThread = pathname.match(/\/chats\/([^/]+)/)?.[1] ?? '';

  return (
    <SidebarBody className="[&>[data-slot=section]+[data-slot=section]]:mt-2">
      {/* Navigation links */}
      <SidebarSection>
        <SidebarItem href="/chats" current={pathname === '/chats'}>
          <ChatBubbleLeftIcon className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
          <SidebarLabel className="font-normal">{t('nav.chats')}</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/projects" current={pathname === '/projects'}>
          <FolderIcon className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
          <SidebarLabel className="font-normal">
            {t('nav.assistants')}
          </SidebarLabel>
        </SidebarItem>
      </SidebarSection>

      <SidebarDivider className="my-1" />

      {/* Starred threads */}
      {starredThreads.length > 0 && (
        <SidebarSection>
          <SidebarHeading>{t('starred.title')}</SidebarHeading>
          {starredThreads.map((thread) => (
            <SidebarThreadItem
              key={thread.publicId}
              thread={thread}
              isActive={thread.publicId === activeThread}
              onClose={closeSidebar}
              onToggleStar={toggleStar}
              onRenamed={renameThread}
              onDeleted={removeThread}
            />
          ))}
        </SidebarSection>
      )}

      {/* Shared threads */}
      {sharedThreads.length > 0 && (
        <SidebarSection>
          <SidebarHeading>{t('shared.title')}</SidebarHeading>
          {sharedThreads.map((thread) => (
            <SidebarThreadItem
              key={thread.publicId}
              thread={thread}
              isActive={thread.publicId === activeThread}
              onClose={closeSidebar}
              onToggleStar={toggleStar}
              onRenamed={renameThread}
              onDeleted={removeThread}
              isShared
            />
          ))}
        </SidebarSection>
      )}

      {/* Recent threads */}
      <SidebarSection>
        <SidebarHeading>{t('recent.title')}</SidebarHeading>
        {(() => {
          if (isLoading && recentThreads.length === 0) {
            return (
              <div className="px-2 py-4 text-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-zinc-400 mx-auto" />
              </div>
            );
          }
          if (recentThreads.length === 0 && starredThreads.length === 0) {
            return (
              <div className="px-2 py-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
                {t('threads.no-threads')}
              </div>
            );
          }
          return (
            <>
              {recentThreads.map((thread) => (
                <SidebarThreadItem
                  key={thread.publicId}
                  thread={thread}
                  isActive={thread.publicId === activeThread}
                  onClose={closeSidebar}
                  onToggleStar={toggleStar}
                  onRenamed={renameThread}
                  onDeleted={removeThread}
                />
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoading}
                  className="w-full px-2 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors disabled:opacity-50"
                >
                  {isLoading
                    ? '...'
                    : t('threads.load-more', { defaultMessage: 'Load more' })}
                </button>
              )}
            </>
          );
        })()}
      </SidebarSection>
    </SidebarBody>
  );
};
