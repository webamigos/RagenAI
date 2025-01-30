import { useTranslations } from 'next-intl';

import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { ModalStateProps, UserDocumentsTable } from './UserDocumentsTable';

import { type UserFileType } from '@/app/contracts/Documents';

type FileListViewProps = {
  documents: UserFileType[];
  isLoading: boolean;
  deleteLoading: boolean;
  isError: boolean;
  showModal: ModalStateProps;
  toggleModal: (fileId: string | null) => void;
  addDocument: (newDocument: UserFileType) => void;
  removeDocument: (documentId: string) => void;
  handlePrefetch: (path: string) => void;
  handleDelete: (
    organization_id: string,
    documentId: string,
    fileName: string
  ) => void;
};

export const FileListView = ({
  documents,
  isLoading,
  deleteLoading,
  isError,
  showModal,
  toggleModal,
  addDocument,
  removeDocument,
  handlePrefetch,
  handleDelete,
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
      deleteLoading={deleteLoading}
      className="font-sans"
      documents={documents}
      toggleModal={toggleModal}
      onAddDocument={addDocument}
      onRemoveDocument={removeDocument}
      handleDelete={handleDelete}
      handlePrefetch={handlePrefetch}
      showModal={showModal}
    />
  );
};
FileListView.displayName = 'FileListView';
