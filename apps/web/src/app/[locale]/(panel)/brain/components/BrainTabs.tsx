'use client';

import { Tab, TabList, Tabs } from '@ragenai/common-ui/Tabs';
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/routing';

const TABS = [
  { key: 'pages', path: '/brain' },
  { key: 'findings', path: '/brain/findings' },
] as const;

export function BrainTabs() {
  const t = useTranslations('brain.tabs');
  const pathname = usePathname();
  // `/brain/pages/…` is a page's detail, which belongs to the pages tab.
  const active = pathname.startsWith('/brain/findings') ? 1 : 0;
  // Each tab is a link and navigates on its own. Pushing here as well moved
  // the current tab on a Ctrl/Cmd-click that asked for a new one.
  const go = () => {};

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
