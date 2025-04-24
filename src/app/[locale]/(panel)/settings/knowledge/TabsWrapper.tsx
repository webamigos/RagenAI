'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Tabs, Tab, TabList } from '@ragenai/common-ui/Tabs';

const tabRoutes = [
  { label: 'documents-list', path: '/settings/knowledge/documents-list' },
  { label: 'upload-files', path: '/settings/knowledge/upload-files' },
  { label: 'create-document', path: '/settings/knowledge/create-document' },
  { label: 'add-from-url', path: '/settings/knowledge/add-from-url' },
];

export default function TabsWrapper() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('manage-knowledge');

  const prefetchTab = (path: string) => {
    router.prefetch(path);
  };

  const pathWithoutLocale = pathname.split('/').slice(2).join('/');
  const activeTab = tabRoutes.findIndex((tab) =>
    `/${pathWithoutLocale}`.startsWith(tab.path)
  );

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
