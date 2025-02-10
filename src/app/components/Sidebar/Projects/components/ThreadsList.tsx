import { useTranslations } from 'next-intl';
import { SidebarLabel } from '@ragenai/common-ui';
import type { ThreadType, ThreadsListProps } from '../types';
import { getThreadCategories } from '@/app/lib/utils/thread-categorization';
import { ThreadItem } from './ThreadItem';

const hasMessages = (thread: ThreadType): boolean => {
  return (
    thread.messages?.length > 0 && thread.messages[0]?.content !== undefined
  );
};

export const ThreadsList = ({
  threads,
  projectId,
  activeThread,
  onClose,
}: ThreadsListProps) => {
  const t = useTranslations('sidebar.threads-categories');

  const threadsWithMessages = threads.filter(hasMessages);
  const categories = getThreadCategories(threadsWithMessages, t);

  return (
    <div className="ml-6 space-y-1">
      {categories.map(
        ({ title, threads }) =>
          threads.length > 0 && (
            <div key={title} className="w-11/12">
              <SidebarLabel className="text-gray-500 dark:text-gray-400 text-xs font-medium pl-2">
                {title}
              </SidebarLabel>
              {threads.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  projectId={projectId}
                  isActive={activeThread === thread.public_id}
                  onClose={onClose}
                />
              ))}
            </div>
          )
      )}
    </div>
  );
};
