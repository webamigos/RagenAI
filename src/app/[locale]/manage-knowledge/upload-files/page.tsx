'use client';

import { UploadKnowledge } from '@/app/components/ManageKnowledge/UploadKnowledge';

const AddFilesPage = () => {
  return (
    <div className="h-full flex-1 flex flex-col gap-4">
      <UploadKnowledge />
    </div>
  );
};

export default AddFilesPage;
