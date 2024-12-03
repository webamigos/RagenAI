'use client';

import { FileListWrapper } from '@/app/components/ManageKnowledge/FileList/FileListWrapper';

const UploadedListPage = () => {
  return (
    <div className="h-screen-minus-10 flex-1 flex flex-col gap-4">
      <FileListWrapper />
    </div>
  );
};

export default UploadedListPage;
