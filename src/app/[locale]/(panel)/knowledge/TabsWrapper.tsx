'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

import { Tabs, Tab, TabList } from '@ragenai/common-ui/Tabs';

const tabRoutes = [
  { label: 'documents-list', path: '/knowledge/documents-list' },
  { label: 'upload-files', path: '/knowledge/upload-files' },
  { label: 'create-document', path: '/knowledge/create-document' },
  { label: 'add-from-url', path: '/knowledge/add-from-url' },
  { label: 'optimize-document', path: '/knowledge/optimize-document' },
];

export default function TabsWrapper() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('manage-knowledge');

  const activeTab = tabRoutes.findIndex((tab) => pathname.startsWith(tab.path));

  return (
    <Tabs
      className="w-full mb-2"
      activeTab={activeTab}
      setActiveTab={(index) => router.push(tabRoutes[index].path)}
    >
      <TabList
        activeTab={activeTab}
        setActiveTab={(index) => router.push(tabRoutes[index].path)}
      >
        {tabRoutes.map((tab, index) => (
          <Tab
            key={index}
            href={tab.path}
            // because Link component is used in Tab, now there is no need to prefetch
            // onMouseEnter={() => prefetchTab(tab.path)}
          >
            {t(`${tab.label}`)}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
