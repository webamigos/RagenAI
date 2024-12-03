'use client';

import { usePathname, useRouter } from 'next/navigation';
import { NextIntlClientProvider, useMessages, useLocale } from 'next-intl';

import {
  PencilSquareIcon,
  CloudArrowUp,
  BulletListIcon,
  Tabs,
  Tab,
  TabList,
  TabPanel,
} from '@ragenai/common-ui';
import { Sidebar } from '@/app/components/Sidebar';
import { Toast } from '@/app/components/Toast';
import { timezone } from '@/app/config';
import { DocumentsProvider } from '@/context/DocumentsContext';

import CreateDocumentPage from './create-document/page';
import UploadedListPage from './documents-list/page';
import AddFilesPage from './upload-files/page';

const ManageKnowledgeLayout = () => {
  const messages = useMessages();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const tabs = [
    {
      key: 'create-document',
      label: 'Create Document',
      icon: PencilSquareIcon,
    },
    { key: 'upload-files', label: 'Upload Files', icon: CloudArrowUp },
    { key: 'documents-list', label: 'Documents List', icon: BulletListIcon },
  ];

  const activeTab = tabs.findIndex((tab) => pathname.includes(tab.key));

  const setActiveTab = (index: number) => {
    router.push(`/manage-knowledge/${tabs[index].key}`);
  };

  const prefetchTab = (key: string) => {
    router.prefetch(`/manage-knowledge/${key}`);
  };

  return (
    <NextIntlClientProvider
      timeZone={timezone}
      messages={messages}
      locale={locale}
    >
      <div className="h-screen flex flex-col">
        <Toast />
        <DocumentsProvider>
          <Sidebar>
            <div className="h-full flex-1 flex flex-col gap-4">
              <Tabs activeTab={activeTab} setActiveTab={setActiveTab}>
                <TabList activeTab={activeTab} setActiveTab={setActiveTab}>
                  {tabs.map((tab) => (
                    <Tab
                      key={tab.key}
                      onMouseEnter={() => prefetchTab(tab.key)}
                    >
                      {tab.label}
                    </Tab>
                  ))}
                </TabList>
                <TabPanel key="create-document">
                  <CreateDocumentPage />
                </TabPanel>
                <TabPanel key="upload-files">
                  <AddFilesPage />
                </TabPanel>
                <TabPanel key="documents-list">
                  <UploadedListPage />
                </TabPanel>
              </Tabs>
            </div>
          </Sidebar>
        </DocumentsProvider>
      </div>
    </NextIntlClientProvider>
  );
};

export default ManageKnowledgeLayout;
