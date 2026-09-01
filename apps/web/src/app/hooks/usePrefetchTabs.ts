import { useEffect } from 'react';

import { useRouter } from '@/i18n/routing';

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
