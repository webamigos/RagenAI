import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { type UserFileType } from '@/app/contracts/Documents';

import { FileCard } from './FileCard';
import { UserFileTypeSafe } from '../FileList/UserDocumentsTable';
import { SupportedFileType } from '@/app/lib/services/file';

type GridViewProps = {
  documents: UserFileType[];
  isLoading: boolean;
  isError: boolean;
  addDocument: (newDocument: UserFileType) => void;
  removeDocument: (documentId: string) => void;
};

export const GridView = ({
  documents,
  isLoading,
  isError,
  addDocument,
  removeDocument,
}: GridViewProps) => {
  const { errorToast } = statusToast();

  if (isLoading) {
    return <SpinnerSVG size="sm" />;
  }

  if (isError) {
    errorToast({ message: 'Error fetching documents' });
    return null;
  }

  return (
    <div className="grid grid-cols-4 gap-4 mt-10">
      {documents.map((doc) => {
        const safeDoc: UserFileTypeSafe = {
          ...doc,
          file_type: doc.file_type as SupportedFileType,
        };
        return <FileCard key={safeDoc.id} document={safeDoc} />;
      })}
    </div>
  );
};
