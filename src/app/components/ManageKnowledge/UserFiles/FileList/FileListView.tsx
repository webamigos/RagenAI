import { useTranslations } from 'next-intl';

import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { ModalStateProps, UserFilesTable } from './UserFilesTable';

import { type UserFileType } from '@/app/contracts/Documents';
import { UserFile } from '@prisma/client';

type FileListViewProps = {
  files: UserFileType[];
  isLoading: boolean;
  deleteLoading: boolean;
  isError: boolean;
  showModal: ModalStateProps;
  toggleModal: (filePublicId: UserFile['public_id'] | null) => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (filePublicId: UserFile['public_id']) => void;
  handleDelete: (
    filePublicId: UserFile['public_id'],
    fileName: UserFile['file_name']
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
