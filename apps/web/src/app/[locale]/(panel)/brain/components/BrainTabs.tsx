'use client';

import { Tab, TabList, Tabs } from '@ragenai/common-ui/Tabs';
import { useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/routing';

const TABS = [
  { key: 'pages', path: '/brain' },
  { key: 'findings', path: '/brain/findings' },
] as const;

export function BrainTabs() {
  const t = useTranslations('brain.tabs');
  const router = useRouter();
  const pathname = usePathname();
  // `/brain/pages/…` is a page's detail, which belongs to the pages tab.
  const active = pathname.startsWith('/brain/findings') ? 1 : 0;
  const go = (index: number) => router.push(TABS[index]!.path);

  return (
    <Tabs className="mb-4 mt-3 w-full" activeTab={active} setActiveTab={go}>
      <TabList activeTab={active} setActiveTab={go}>
        {TABS.map((tab) => (
          <Tab key={tab.key} href={tab.path}>
            {t(tab.key)}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
