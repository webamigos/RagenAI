'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Tabs, Tab, TabList } from '@ragenai/common-ui/Tabs';

const tabRoutes = [
  { label: 'create-document', path: '/manage-knowledge/create-document' },
  { label: 'documents-list', path: '/manage-knowledge/documents-list' },
  { label: 'upload-files', path: '/manage-knowledge/upload-files' },
];

export default function TabsWrapper() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('manage-knowledge');

  const prefetchTab = (key: string) => {
    router.prefetch(`/manage-knowledge/${key}`);
  };

  const activeTab = tabRoutes.findIndex((tab) => pathname.startsWith(tab.path));

  return (
    <Tabs
      className="w-full"
      activeTab={activeTab}
      setActiveTab={(index) => router.push(tabRoutes[index].path)}
    >
      <TabList
        activeTab={activeTab}
        setActiveTab={(index) => router.push(tabRoutes[index].path)}
      >
        {tabRoutes.map((tab, index) => (
          <Tab key={index} onMouseEnter={() => prefetchTab(tab.path)}>
            {t(`${tab.label}`)}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
