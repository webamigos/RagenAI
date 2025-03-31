import { useTranslations } from 'next-intl';
import { SidebarLabel, SidebarSection } from '@ragenai/common-ui';
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
  projectPublicId,
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
            <SidebarSection key={title} className="w-11/12">
              <SidebarLabel className="text-gray-600 dark:text-gray-400 text-xs font-semibold uppercase pl-2 mt-2 ">
                {title}
              </SidebarLabel>
              {threads.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  projectId={projectId}
                  projectPublicId={projectPublicId}
                  isActive={activeThread === thread.public_id}
                  onClose={onClose}
                />
              ))}
            </SidebarSection>
          )
      )}
    </div>
  );
};
