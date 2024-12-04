'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { FileListWrapper } from '@/app/components/ManageKnowledge/FileList/FileListWrapper';

const UploadedListPage = () => {
  const t = useTranslations('Metadata');

  useEffect(() => {
    document.title = t('manage-knowledge:document-list.title');
  }, [t]);

  return (
    <div className="h-screen-minus-10 flex-1 flex flex-col gap-4">
      <FileListWrapper />
    </div>
  );
};

export default UploadedListPage;
