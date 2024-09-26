'use client';

import { UploadKnowledge } from './UploadKnowledge/';
import { FileList } from './FileList';

export const AdminPanel = () => {
  return (
    <div className="flex flex-col gap-4">
      <UploadKnowledge />
      <FileList />
    </div>
  );
};
