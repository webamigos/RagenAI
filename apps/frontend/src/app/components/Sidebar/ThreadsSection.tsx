import { SidebarLabel, SidebarItem } from '@salesyy/common-ui';
import { ThreadHistoryResponse } from '../../contracts/Message';

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
  activeThread,
  threadCategories,
  lastThreadElementRef,
  handleThreadClick,
}: Props) => {
  return (
    <>
      {threadCategories.map(
        ({ title, threads }, categoryIndex) =>
          threads.length > 0 && (
            <div key={title}>
              <SidebarLabel className="ml-1">{title}</SidebarLabel>
              {threads.map((thread, index) => {
                const isActive = thread.public_id === activeThread;
                const isLastThreadInAllCategories =
                  categoryIndex === threadCategories.length - 1 &&
                  index === threads.length - 1;
                return (
                  <div
                    className="mb-1.5 last-of-type:mb-10 first-of-type:mt-5"
                    ref={
                      isLastThreadInAllCategories ? lastThreadElementRef : null
                    }
                    key={thread.id}
                  >
                    <SidebarItem
                      onClick={() => handleThreadClick(thread.public_id)}
                      current={isActive}
                    >
                      {thread.messages[0].content}
                    </SidebarItem>
                  </div>
                );
              })}
            </div>
          )
      )}
    </>
  );
};
