'use client';

import { SidebarItem, SidebarLabel } from '@ragenai/tui/sidebar';
import { truncateFileName } from '@/app/lib/utils/truncateFileName';
import { ThreadDropdownMenu } from '@/app/components/ThreadDropdownMenu';
import type { SidebarThreadItem as SidebarThreadItemType } from '@/features/threads/contracts/thread.types';

type Props = {
  thread: SidebarThreadItemType;
  isActive: boolean;
  onClose?: () => void;
  onToggleStar: (threadPublicId: string, isStarred: boolean) => void;
  onRenamed?: (threadPublicId: string, newTitle: string) => void;
  onDeleted?: (threadPublicId: string) => void;
  isShared?: boolean;
};

function getThreadDisplayTitle(thread: SidebarThreadItemType): string {
  return thread.title || 'New conversation';
}

function getThreadHref(thread: SidebarThreadItemType): string {
  return `/chats/${thread.publicId}`;
}

export const SidebarThreadItem = ({
  thread,
  isActive,
  onClose,
  onToggleStar,
  onRenamed,
  onDeleted,
  isShared = false,
}: Props) => {
  const title = getThreadDisplayTitle(thread);
  const href = getThreadHref(thread);

  return (
    <div className="group relative">
      <SidebarItem
        href={href}
        current={isActive}
        onClick={onClose}
        aria-label={`Thread: ${title}`}
        aria-current={isActive ? 'page' : undefined}
      >
        <SidebarLabel className="font-normal pr-6">{title}</SidebarLabel>
      </SidebarItem>
      <div className="absolute right-1 top-1/2 -translate-y-1/2">
        <ThreadDropdownMenu
          thread={thread}
          onStarred={onToggleStar}
          onRenamed={onRenamed}
          onDeleted={onDeleted}
          side="right"
          align="start"
          isOwner={!isShared}
        />
      </div>
    </div>
  );
};
