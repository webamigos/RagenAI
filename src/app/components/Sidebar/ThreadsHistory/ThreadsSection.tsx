import { SidebarLabel, SidebarItem } from '@salesyy/common-ui';
import { ThreadHistoryResponse } from '../../../contracts/Message';
import { useSidebar } from '@/app/hooks/useSidebar';

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
  const { closeSidebar } = useSidebar();

  return (
    <>
      {threadCategories.map(
        ({ title, threads }, categoryIndex) =>
          threads.length > 0 && (
            <div key={title}>
              <SidebarLabel className="ml-1">{title}</SidebarLabel>

              {threads.map((thread, index) => {
                const contentPreview =
                  thread.messages[0]?.content.length > 40
                    ? `${thread.messages[0]?.content.slice(0, 40)}...`
                    : thread.messages[0]?.content;
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
                    key={thread.public_id}
                  >
                    <SidebarItem
                      className="cursor-pointer"
                      onClick={() => {
                        handleThreadClick(thread.public_id);
                        closeSidebar();
                      }}
                      current={isActive}
                    >
                      {`${contentPreview}`}
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
