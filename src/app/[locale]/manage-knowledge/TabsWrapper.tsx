'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Tabs, Tab, TabList } from '@ragenai/common-ui/Tabs';

const tabRoutes = [
  { label: 'create-document', path: '/manage-knowledge/create-document' },
  { label: 'upload-files', path: '/manage-knowledge/upload-files' },
  { label: 'documents-list', path: '/manage-knowledge/documents-list' },
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
