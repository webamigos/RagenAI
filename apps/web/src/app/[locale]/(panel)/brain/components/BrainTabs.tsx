'use client';

import { Tab, TabList, Tabs } from '@ragenai/common-ui/Tabs';
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/routing';

const TABS = [
  { key: 'pages', path: '/brain' },
  { key: 'findings', path: '/brain/findings' },
  { key: 'graph', path: '/brain/graph' },
  { key: 'documents', path: '/brain/documents' },
] as const;

export function BrainTabs() {
  const t = useTranslations('brain.tabs');
  const pathname = usePathname();
  // `/brain/pages/…` is a page's detail, which belongs to the pages tab.
  const active = TABS.findIndex(
    (tab, i) => i > 0 && pathname.startsWith(tab.path),
  );
  const current = active === -1 ? 0 : active;
  // Each tab is a link and navigates on its own. Pushing here as well moved
  // the current tab on a Ctrl/Cmd-click that asked for a new one.
  const go = () => {};

  return (
    <Tabs className="mb-4 mt-3 w-full" activeTab={current} setActiveTab={go}>
      <TabList activeTab={current} setActiveTab={go}>
        {TABS.map((tab) => (
          <Tab key={tab.key} href={tab.path}>
            {t(tab.key)}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
