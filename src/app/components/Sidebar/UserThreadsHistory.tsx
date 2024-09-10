import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SidebarSection, SidebarLabel, SpinnerSVG } from '@salesyy/common-ui';
import { ChatConversation } from '@salesyy/common-ui';
import { ThreadsSection } from './ThreadsSection';
import { ThreadHistoryResponse } from '../../contracts/Message';
import { useThreadsContext } from '../../hooks/useThreadsContext';
import { format, subDays } from 'date-fns';

type Props = {
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  activeThread: string;
  userThreads: ThreadHistoryResponse[];
  handleThreadClick: (threadId: string) => void;
};

export const UserThreadsHistory = ({
  error,
  hasMore,
  isLoading,
  userThreads,
  activeThread,
  handleThreadClick,
}: Props) => {
  const t = useTranslations('chat');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastThreadElementRef = useRef<HTMLDivElement | null>(null);
  const { loadMoreThreads } = useThreadsContext();

  useEffect(() => {
    if (isLoading || !hasMore) return;

    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          loadMoreThreads();
        }
      },
      { threshold: 1.0 }
    );

    const currentLastElement = lastThreadElementRef.current;
    if (currentLastElement) {
      observerRef.current.observe(currentLastElement);
    }

    return () => {
      if (observerRef.current && currentLastElement) {
        observerRef.current.unobserve(currentLastElement);
        observerRef.current.disconnect();
      }
    };
  }, [isLoading, hasMore, loadMoreThreads]);

  const categorizeThreads = (threads: ThreadHistoryResponse[]) => {
    const now = new Date();
    const todayDate = format(now, 'EEE MMM dd yyyy');
    const yesterdayDate = format(subDays(now, 1), 'EEE MMM dd yyyy');

    return threads.reduce(
      (acc, thread) => {
        const threadDate = new Date(thread.created_at).toDateString();
        if (threadDate === todayDate) acc.today.push(thread);
        else if (threadDate === yesterdayDate) acc.yesterday.push(thread);
        else acc.older.push(thread);
        return acc;
      },
      {
        today: [] as ThreadHistoryResponse[],
        yesterday: [] as ThreadHistoryResponse[],
        older: [] as ThreadHistoryResponse[],
      }
    );
  };

  const { today, yesterday, older } = categorizeThreads(userThreads);

  const threadCategories = [
    { title: t('today'), threads: today },
    { title: t('yesterday'), threads: yesterday },
    { title: t('older'), threads: older },
  ];

  return (
    <SidebarSection>
      <div className="flex items-center ml-2 mb-5 gap-2 text-lg">
        <ChatConversation />
        <SidebarLabel>{t('chat-history')}</SidebarLabel>
      </div>
      <ThreadsSection
        activeThread={activeThread}
        threadCategories={threadCategories}
        handleThreadClick={handleThreadClick}
        lastThreadElementRef={lastThreadElementRef}
      />
      {isLoading && <SpinnerSVG />}
      {error && <SidebarLabel className="text-red-500">{error}</SidebarLabel>}
    </SidebarSection>
  );
};
