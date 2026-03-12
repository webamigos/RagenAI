import { useTranslations } from 'next-intl';

import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { Text } from '@ragenai/common-ui/Text';
import { type UserFile } from '@/generated/prisma/browser';

import { FileCard } from './FileCard';
import { DeleteFileModal } from '../DeleteFileModal';

import {
  type ModalStateProps,
  type UserFileTypeSafe,
} from '../FileList/UserFilesTable';
import { type UserFileType } from '@/features/documents/contracts/document.types';

type GridViewProps = {
  files: UserFileType[];
  isLoading: boolean;
  isError: boolean;
  showModal: ModalStateProps;
  deleteLoading: boolean;
  toggleModal: (publicFileId: UserFile['public_id'] | null) => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (publicFileId: UserFile['public_id']) => void;
  handleDelete: (
    filePublicId: UserFile['public_id'],
    fileName: UserFile['file_name'],
  ) => void;
};

export const GridView = ({
  files,
  isLoading,
  deleteLoading,
  isError,
  showModal,
  handleDelete,
  toggleModal,
}: GridViewProps) => {
  const t = useTranslations('error-toast');
  const { errorToast } = statusToast();

  if (isLoading) {
    return <SpinnerSVG size="sm" />;
  }

  if (isError) {
    errorToast({ message: t('fetching-error') });
    return null;
  }

  if (files.length === 0) {
    return (
      <div className="flex justify-center mt-[3.8rem]">
        <Text fontSize="sm" className="text-gray-500">
          {t('no-files')}
        </Text>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">
      {files.map((file) => (
        <FileCard
          key={file.public_id}
          file={file as UserFileTypeSafe}
          isLoading={isLoading}
          deleteLoading={deleteLoading}
          toggleModal={toggleModal}
        />
      ))}
      {showModal.filePublicId && (
        <DeleteFileModal
          isOpen={showModal.isOpen}
          onClose={() => toggleModal(null)}
          onConfirm={handleDelete}
          fileName={
            files.find((f) => f.public_id === showModal.filePublicId)
              ?.file_name ?? ''
          }
          filePublicId={showModal.filePublicId}
          isLoading={deleteLoading}
        />
      )}
    </div>
  );
};
