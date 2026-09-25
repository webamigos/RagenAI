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
  const t = useTranslations('brain');
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
    <div className="mb-4 mt-3">
      <Tabs className="w-full" activeTab={current} setActiveTab={go}>
        <TabList activeTab={current} setActiveTab={go}>
          {TABS.map((tab) => (
            <Tab key={tab.key} href={tab.path}>
              {t(`tabs.${tab.key}`)}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      {/*
        What this tab is for, in one line: four tabs over one feature read as
        four names for the same thing until someone says how they differ.
      */}
      <p
        data-testid="brain-tab-hint"
        className="mt-2 max-w-3xl text-[13px] text-muted-foreground"
      >
        {t(`tab-hints.${TABS[current]!.key}`)}
      </p>
    </div>
  );
}
