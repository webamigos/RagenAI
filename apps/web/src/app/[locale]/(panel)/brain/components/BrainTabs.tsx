'use client';

import { Tab, TabList, Tabs } from '@ragenai/common-ui/Tabs';
import { useTranslations } from 'next-intl';
import { useSelectedLayoutSegment } from 'next/navigation';

const TABS = [
  { key: 'pages', path: '/brain', segment: null },
  { key: 'findings', path: '/brain/findings', segment: 'findings' },
  { key: 'graph', path: '/brain/graph', segment: 'graph' },
  { key: 'documents', path: '/brain/documents', segment: 'documents' },
] as const;

export function BrainTabs() {
  const t = useTranslations('brain');
  // The route segment under /brain, not the address. A page opened in the
  // graph's drawer has the page's address, `/brain/pages/…`, while the graph
  // is still the screen — the address lit the pages tab over the graph.
  // `pages` (a page's detail) and none (`/brain`) are the pages tab.
  const segment = useSelectedLayoutSegment();
  const active = TABS.findIndex((tab, i) => i > 0 && tab.segment === segment);
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
