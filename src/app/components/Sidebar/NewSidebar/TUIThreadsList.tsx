import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';
import { SidebarHeading } from '@ragenai/tui/sidebar';
import { EmptyState } from '@ragenai/tui/empty-state';
import type { ThreadType, ThreadsListProps } from '../Projects/types';
import { getThreadCategories } from '@/app/lib/utils/thread-categorization';
import { TUIThreadItem } from './TUIThreadItem';

const hasContent = (thread: ThreadType): boolean => {
  return thread.title !== undefined || (thread.messages?.length ?? 0) > 0;
};

export const TUIThreadsList = ({
  threads,
  projectId,
  activeThread,
  onClose,
}: ThreadsListProps) => {
  const t = useTranslations('sidebar.threads-categories');
  const tThreads = useTranslations('sidebar.threads');

  const threadsWithMessages = useMemo(() => {
    return threads.filter(hasContent);
  }, [threads]);

  const categories = useMemo(() => {
    return getThreadCategories(threadsWithMessages, t);
  }, [threadsWithMessages, t]);

  if (categories.every((category) => category.threads.length === 0)) {
    return (
      <EmptyState
        icon={
          <ChatBubbleLeftEllipsisIcon className="size-8 text-zinc-400 dark:text-zinc-500" />
        }
        title={tThreads('no-threads')}
        description={tThreads('no-threads-description')}
        className="py-6"
      />
    );
  }

  return (
    <div className="space-y-3" role="navigation" aria-label="Project threads">
      {categories.map(
        ({ title, threads }) =>
          threads.length > 0 && (
            <div key={title} className="space-y-1">
              <SidebarHeading className="text-xs" role="heading" aria-level={4}>
                {title}
              </SidebarHeading>
              <div
                className="space-y-0.5"
                role="list"
                aria-label={`${title} project threads`}
              >
                {threads.map((thread) => (
                  <div key={thread.id} role="listitem">
                    <TUIThreadItem
                      thread={thread}
                      projectId={projectId}
                      isActive={activeThread === thread.id}
                      onClose={onClose}
                    />
                  </div>
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  );
};
