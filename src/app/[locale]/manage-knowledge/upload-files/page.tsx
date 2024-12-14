'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { UploadKnowledge } from '@/app/components/ManageKnowledge/UploadKnowledge';

const AddFilesPage = () => {
  const t = useTranslations('Metadata');

  useEffect(() => {
    document.title = t('manage-knowledge:upload-document.title');
  }, [t]);

  return (
    <div className="h-full flex-1 flex flex-col gap-4">
      <UploadKnowledge />
    </div>
  );
};

export default AddFilesPage;
