import { useTranslations } from 'next-intl';

import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { UserDocumentsTable } from './UserDocumentsTable';

import { type UserFileType } from '@/app/contracts/Documents';

type FileListViewProps = {
  documents: UserFileType[];
  isLoading: boolean;
  isError: boolean;
  addDocument: (newDocument: UserFileType) => void;
  removeDocument: (documentId: string) => void;
};

export const FileListView = ({
  documents,
  isLoading,
  isError,
  addDocument,
  removeDocument,
}: FileListViewProps) => {
  const { errorToast } = statusToast();
  const t = useTranslations('admin-panel-page');

  if (isLoading) {
    return <SpinnerSVG size="sm" />;
  }

  if (isError) {
    errorToast({ message: t('fetching-error') });
  }

  return (
    <UserDocumentsTable
      className="font-sans"
      documents={documents}
      onAddDocument={addDocument}
      onRemoveDocument={removeDocument}
    />
  );
};
FileListView.displayName = 'FileListView';
