'use client';

import { FileList } from './FileList';
import { Card } from '@ragenai/common-ui/Card';

export const FileListWrapper = () => {
  return (
    <Card title="Lista plików" size="full">
      <FileList />
    </Card>
  );
};
