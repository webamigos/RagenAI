import { type ComponentProps } from 'react';
import { ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

import {
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
} from '@ragenai/tui/sidebar';
import { useSidebar } from '@/app/hooks/useSidebar';
import { truncateFileName } from '@/app/lib/utils/truncateFileName';

import { type ThreadHistoryResponse } from '@/features/threads/contracts/thread.types';

type Category = {
  title: string;
  threads: ThreadHistoryResponse[];
};

type Props = {
  activeThread: string;
  threadCategories: Category[];
  lastThreadElementRef: React.MutableRefObject<HTMLDivElement | null>;
};

export const TUIThreadsSection = ({
  className,
  activeThread,
  threadCategories,
  lastThreadElementRef,
}: Props & ComponentProps<'div'>) => {
  const { closeSidebar } = useSidebar();
  const t = useTranslations('sidebar.threads');
  const nonEmptyCategories = threadCategories.filter((c) => c.threads?.length);

  if (nonEmptyCategories.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 dark:text-gray-400">
        <ChatBubbleLeftIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{t('no-threads')}</p>
        <p className="text-xs mt-1">{t('no-threads-description')}</p>
      </div>
    );
  }

  return (
    <div className={className} role="navigation" aria-label="Thread history">
      {nonEmptyCategories.map(
        ({ title, threads }, categoryIndex) =>
          threads.length > 0 && (
            <div key={title} className="w-11/12">
              <SidebarHeading
                className="text-gray-500 dark:text-gray-100 font-bold p-2 uppercase"
                role="heading"
                aria-level={3}
              >
                {title}
              </SidebarHeading>
              <div
                className="space-y-0.5"
                role="list"
                aria-label={`${title} threads`}
              >
                {threads.map((thread, index) => {
                  const contentPreview =
                    thread.messages[0]?.content.length > 30
                      ? truncateFileName(thread.messages[0]?.content, 30)
                      : thread.messages[0]?.content;
                  const isActive = thread.public_id === activeThread;
                  const isLastThreadInAllCategories =
                    categoryIndex === nonEmptyCategories.length - 1 &&
                    index === threads.length - 1;

                  return (
                    <div
                      className="first-of-type:mt-1.5 last-of-type:mb-2"
                      ref={
                        isLastThreadInAllCategories
                          ? lastThreadElementRef
                          : null
                      }
                      key={thread.public_id}
                      role="listitem"
                    >
                      <SidebarItem
                        href={`/chats/${thread.public_id}`}
                        current={isActive}
                        onClick={() => closeSidebar()}
                        aria-label={`Thread: ${contentPreview}`}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <SidebarLabel className="font-normal">
                          {contentPreview}
                        </SidebarLabel>
                      </SidebarItem>
                    </div>
                  );
                })}
              </div>
            </div>
          ),
      )}
    </div>
  );
};
