import { useRef, useEffect } from 'react';
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
  toggleModal: (publicFileId: UserFile['id'] | null) => void;
  addFile: (newFile: UserFileType) => void;
  removeFile: (publicFileId: UserFile['id']) => void;
  handleDelete: (
    fileId: UserFile['id'],
    fileName: UserFile['fileName'],
  ) => void;
  isSelected?: (id: string) => boolean;
  isAllSelected?: (ids: string[]) => boolean;
  isIndeterminate?: (ids: string[]) => boolean;
  onToggleFile?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
};

export const GridView = ({
  files,
  isLoading,
  deleteLoading,
  isError,
  showModal,
  handleDelete,
  toggleModal,
  isSelected,
  isAllSelected,
  isIndeterminate,
  onToggleFile,
  onToggleAll,
}: GridViewProps) => {
  const selectAllRef = useRef<HTMLInputElement>(null);
  const fileIds = files.map((f) => f.id);
  const t = useTranslations('error-toast');
  const tBulkBar = useTranslations('bulk-action-bar');
  const { errorToast } = statusToast();

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate
        ? isIndeterminate(fileIds)
        : false;
    }
  }, [isIndeterminate, fileIds]);

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
    <>
      {onToggleAll && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={isAllSelected ? isAllSelected(fileIds) : false}
            onChange={() => onToggleAll(fileIds)}
            aria-label={tBulkBar('select-all')}
            data-testid="grid-select-all-checkbox"
            className="size-4 cursor-pointer rounded border-gray-300 accent-blue-600"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {tBulkBar('select-all')}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mt-4 px-0.5">
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file as UserFileTypeSafe}
            isLoading={isLoading}
            deleteLoading={deleteLoading}
            toggleModal={toggleModal}
            isSelected={isSelected ? isSelected(file.id) : undefined}
            onToggleFile={onToggleFile}
          />
        ))}
        {showModal.fileId && (
          <DeleteFileModal
            isOpen={showModal.isOpen}
            onClose={() => toggleModal(null)}
            onConfirm={handleDelete}
            fileName={
              files.find((f) => f.id === showModal.fileId)?.fileName ?? ''
            }
            fileId={showModal.fileId}
            isLoading={deleteLoading}
          />
        )}
      </div>
    </>
  );
};
