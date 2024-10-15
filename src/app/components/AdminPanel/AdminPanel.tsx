import { FileListWrapper } from './FileList/FileListWrapper';
import { UploadKnowledge } from './UploadKnowledge/';
import { DocumentCreator } from '../MarkdownDocumentsCreator/DocumentCreator';

export const AdminPanel = () => {
  return (
    <div className="flex flex-col gap-4">
      <DocumentCreator />
      <UploadKnowledge />
      <FileListWrapper />
    </div>
  );
};
