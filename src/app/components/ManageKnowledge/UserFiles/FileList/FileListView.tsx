import { useTranslations } from 'next-intl';

import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { type ModalStateProps, UserFilesTable } from './UserFilesTable';

import { type UserFileType } from '@/features/documents/contracts/document.types';
import { type UserFile } from '@/generated/prisma/browser';

type FileListViewProps = {
  files: UserFileType[];
  isLoading: boolean;
  deleteLoading: boolean;
  isError: boolean;
  showModal: ModalStateProps;
  toggleModal: (filePublicId: UserFile['publicId'] | null) => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (filePublicId: UserFile['publicId']) => void;
  handleDelete: (
    filePublicId: UserFile['publicId'],
    fileName: UserFile['fileName'],
  ) => void;
};

export const FileListView = ({
  files,
  isLoading,
  deleteLoading,
  isError,
  showModal,
  toggleModal,
  addFile,
  removeFile,
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
    <UserFilesTable
      deleteLoading={deleteLoading}
      className="font-sans"
      files={files}
      toggleModal={toggleModal}
      onAddFile={addFile}
      onRemoveFile={removeFile}
      handleDelete={handleDelete}
      showModal={showModal}
    />
  );
};
FileListView.displayName = 'FileListView';
