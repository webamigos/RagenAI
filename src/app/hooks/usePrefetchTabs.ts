import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type TabItem = {
  path: string;
};

export const usePrefetchTabs = (tabs: TabItem[]) => {
  const router = useRouter();

  useEffect(() => {
    tabs.forEach((tab) => {
      router.prefetch(tab.path);
    });
  }, [tabs, router]);
};
