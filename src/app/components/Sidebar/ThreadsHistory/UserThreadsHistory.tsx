import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { format, subDays } from 'date-fns';

import {
  SidebarSection,
  SidebarLabel,
  SpinnerSVG,
  Text,
} from '@salesyy/common-ui';
import { ThreadsSection } from './ThreadsSection';
import { ThreadHistoryResponse } from '../../../contracts/Message';
import { useThreadsContext } from '../../../hooks/useThreadsContext';
import { ClockIcon } from '@heroicons/react/24/outline';

type Props = {
  hasMore: boolean;
  isLoading: boolean;
  isSignedIn?: boolean;
  error: string | null;
  activeThread: string;
  userThreads: ThreadHistoryResponse[];
  isThreadsLoaded: boolean;
  handleThreadClick: (threadId: string) => void;
};

export const UserThreadsHistory = ({
  error,
  hasMore,
  isLoading,
  isSignedIn,
  userThreads,
  activeThread,
  isThreadsLoaded,
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
  }, [isLoading, hasMore, isSignedIn, isThreadsLoaded, loadMoreThreads]);

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
      <div className="flex items-center ml-2 mt-2.5 mb-2 gap-2">
        <ClockIcon className="w-5 h-5" />
        <Text className="font-sans text-sm text-gray-600 font-medium tracking-wide">
          {t('chat-history')}
        </Text>
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <SpinnerSVG size="md" />
        </div>
      )}

      <ThreadsSection
        className="flex flex-col justify-end items-end mt-1"
        activeThread={activeThread}
        threadCategories={threadCategories}
        handleThreadClick={handleThreadClick}
        lastThreadElementRef={lastThreadElementRef}
      />

      {error && <SidebarLabel className="text-red-500">{error}</SidebarLabel>}
    </SidebarSection>
  );
};
