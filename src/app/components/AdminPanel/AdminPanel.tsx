import React, { useState } from 'react';
import { FileListWrapper } from './FileList/FileListWrapper';
import { UploadKnowledge } from './UploadKnowledge/';
import { DocumentCreator } from '../MarkdownDocumentsCreator/DocumentCreator';
import {
  Tab,
  Tabs,
  TabList,
  TabPanel,
  CloudArrowUp,
  BulletListIcon,
  PencilSquareIcon,
} from '@salesyy/common-ui';
import { useTranslations } from 'next-intl';

export const AdminPanel = () => {
  const t = useTranslations('admin-panel-page');
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab}>
        <TabList activeTab={activeTab} setActiveTab={setActiveTab}>
          <Tab key="add-files">
            {t('add-files')} <CloudArrowUp className="ml-3" />
          </Tab>
          <Tab key="create-file">
            {t('create-file')} <PencilSquareIcon className="ml-3" />
          </Tab>
          <Tab key="uploaded-list">
            {t('uploaded-list')} <BulletListIcon className="ml-3" />
          </Tab>
        </TabList>
        {activeTab === 0 && (
          <TabPanel key="upload-knowledge">
            <UploadKnowledge />
          </TabPanel>
        )}
        {activeTab === 1 && (
          <TabPanel key="document-creator">
            <DocumentCreator />
          </TabPanel>
        )}
        {activeTab === 2 && (
          <TabPanel key="file-list-wrapper">
            <FileListWrapper />
          </TabPanel>
        )}
      </Tabs>
    </div>
  );
};
