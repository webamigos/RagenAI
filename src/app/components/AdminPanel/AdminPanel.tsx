import { FileListWrapper } from './FileList/FileListWrapper';
import { UploadKnowledge } from './UploadKnowledge/';

export const AdminPanel = () => {
  return (
    <div className="flex flex-col gap-4">
      <UploadKnowledge />
      <FileListWrapper />
    </div>
  );
};
