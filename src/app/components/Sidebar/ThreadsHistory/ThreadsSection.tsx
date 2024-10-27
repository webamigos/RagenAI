import { ComponentProps } from 'react';

import { SidebarLabel, SidebarItem, classMerge } from '@salesyy/common-ui';
import { useSidebar } from '@/app/hooks/useSidebar';
import { truncateFileName } from '@/app/lib/utils/truncateFileName';

import { ThreadHistoryResponse } from '../../../contracts/Message';

type Category = {
  title: string;
  threads: ThreadHistoryResponse[];
};

type Props = {
  activeThread: string;
  threadCategories: Category[];
  handleThreadClick: (threadId: string) => void;
  lastThreadElementRef: React.MutableRefObject<HTMLDivElement | null>;
};

export const ThreadsSection = ({
  className,
  activeThread,
  threadCategories,
  lastThreadElementRef,
  handleThreadClick,
}: Props & ComponentProps<'div'>) => {
  const { closeSidebar } = useSidebar();

  return (
    <div className={classMerge(className)}>
      {threadCategories.map(
        ({ title, threads }, categoryIndex) =>
          threads.length > 0 && (
            <div key={title} className="w-11/12 mt-3">
              <SidebarLabel className="text-gray-600 font-bold p-2">
                {title}
              </SidebarLabel>
              {threads.map((thread, index) => {
                const contentPreview =
                  thread.messages[0]?.content.length > 30
                    ? truncateFileName(thread.messages[0]?.content, 30)
                    : thread.messages[0]?.content;
                const isActive = thread.public_id === activeThread;
                const isLastThreadInAllCategories =
                  categoryIndex === threadCategories.length - 1 &&
                  index === threads.length - 1;

                return (
                  <div
                    className="first-of-type:mt-1.5 last-of-type:mb-2"
                    ref={
                      isLastThreadInAllCategories ? lastThreadElementRef : null
                    }
                    key={thread.public_id}
                  >
                    <SidebarItem
                      hasIcon={true}
                      onClick={() => {
                        handleThreadClick(thread.public_id);
                        closeSidebar();
                      }}
                      current={isActive}
                      className={classMerge(
                        'font-normal text-gray-700',
                        isActive ? 'text-primary-blue-400' : 'hover:bg-gray-100'
                      )}
                    >
                      {contentPreview}
                    </SidebarItem>
                  </div>
                );
              })}
            </div>
          )
      )}
    </div>
  );
};
