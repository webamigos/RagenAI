import { useTranslations } from 'next-intl';

import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { type ModalStateProps, UserFilesTable } from './UserFilesTable';

import {
  type UserFileType,
  type DocumentFolderItem,
} from '@/features/documents/contracts/document.types';
import { type UserFile } from '@/generated/prisma/browser';

type FileListViewProps = {
  files: UserFileType[];
  subfolders?: DocumentFolderItem[];
  onNavigateFolder?: (folderId: string) => void;
  isLoading: boolean;
  deleteLoading: boolean;
  isError: boolean;
  showModal: ModalStateProps;
  toggleModal: (fileId: UserFile['id'] | null) => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (fileId: UserFile['id']) => void;
  handleDelete: (
    fileId: UserFile['id'],
    fileName: UserFile['fileName'],
  ) => void;
  isSelected?: (id: string) => boolean;
  isAllSelected?: (ids: string[]) => boolean;
  isIndeterminate?: (ids: string[]) => boolean;
  onToggleFile?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
  onUpload?: () => void;
  onCreateDocument?: () => void;
  onAddFromUrl?: () => void;
};

export const FileListView = ({
  files,
  subfolders,
  onNavigateFolder,
  isLoading,
  deleteLoading,
  isError,
  showModal,
  toggleModal,
  addFile,
  removeFile,
  handleDelete,
  isSelected,
  isAllSelected,
  isIndeterminate,
  onToggleFile,
  onToggleAll,
  onUpload,
  onCreateDocument,
  onAddFromUrl,
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
      subfolders={subfolders}
      onNavigateFolder={onNavigateFolder}
      toggleModal={toggleModal}
      onAddFile={addFile}
      onRemoveFile={removeFile}
      handleDelete={handleDelete}
      showModal={showModal}
      isSelected={isSelected}
      isAllSelected={isAllSelected}
      isIndeterminate={isIndeterminate}
      onToggleFile={onToggleFile}
      onToggleAll={onToggleAll}
      onUpload={onUpload}
      onCreateDocument={onCreateDocument}
      onAddFromUrl={onAddFromUrl}
    />
  );
};
FileListView.displayName = 'FileListView';
