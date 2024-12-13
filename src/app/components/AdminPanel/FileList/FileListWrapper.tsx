'use client';

import { useTranslations } from 'next-intl';

import { FileList } from './FileList';
import { Card } from '@ragenai/common-ui/Card';

export const FileListWrapper = () => {
  const t = useTranslations('files-table');

  return (
    <Card title={t('title')} size="full">
      <FileList />
    </Card>
  );
};
