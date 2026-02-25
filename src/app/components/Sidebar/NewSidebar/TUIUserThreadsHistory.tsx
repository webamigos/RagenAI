import { useRef, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { SidebarSection, SidebarHeading } from '@ragenai/tui/sidebar';
import { TUIThreadsSection } from './TUIThreadsSection';
import { ThreadHistoryResponse } from '@/features/threads/contracts/thread.types';
import { getThreadCategories } from '@/app/lib/utils/thread-categorization';

type Props = {
  hasMore: boolean;
  isLoading: boolean;
  isSignedIn?: boolean;
  error: string | null;
  activeThread?: string;
  userThreads: ThreadHistoryResponse[];
  isThreadsLoaded: boolean;
  loadMoreThreads: () => void;
};

export const TUIUserThreadsHistory = ({
  error,
  hasMore,
  isLoading,
  isSignedIn,
  userThreads,
  activeThread = '',
  isThreadsLoaded,
  loadMoreThreads,
}: Props) => {
  const t = useTranslations('chat');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastThreadElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoading || !hasMore) return;

    if (typeof IntersectionObserver === 'undefined') {
      const handleScroll = () => {
        const scrollTop =
          window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const docHeight = document.documentElement.scrollHeight;

        if (scrollTop + windowHeight >= docHeight - 1000) {
          loadMoreThreads();
        }
      };

      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }

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

  const threadCategories = useMemo(() => {
    return getThreadCategories(userThreads, t);
  }, [userThreads, t]);

  return (
    <SidebarSection>
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400 dark:border-zinc-600"></div>
          </div>
        )}

        <TUIThreadsSection
          className="flex flex-col justify-end"
          activeThread={activeThread}
          threadCategories={threadCategories}
          lastThreadElementRef={lastThreadElementRef}
        />

        {error && (
          <div className="text-red-500 dark:text-red-400 text-sm">{error}</div>
        )}
      </div>
    </SidebarSection>
  );
};
