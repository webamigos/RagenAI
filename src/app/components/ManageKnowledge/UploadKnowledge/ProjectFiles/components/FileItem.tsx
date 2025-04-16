import { memo, useState } from 'react';
import prettyBytes from 'pretty-bytes';

import { Text, TrashIcon } from '@ragenai/common-ui';
import { DeleteFileModal } from '../../../UserFiles/DeleteFileModal';

import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { FileType, UserFile } from '@prisma/client';

type FileItemProps = {
  file: {
    public_id: string;
    file_name: string;
    file_size: number;
    file_type: FileType;
    created_at: Date | null;
  };
  onDelete: (publicFileId: UserFile['public_id']) => void;
  isDeleting: boolean;
  t: any;
};

export const FileItem = memo(
  ({ file, onDelete, isDeleting, t }: FileItemProps) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const formattedSize = prettyBytes(file.file_size);
    const formattedDate = file.created_at
      ? new Date(file.created_at).toLocaleDateString()
      : '-';

    const toggleModal = (fileId: string | null) => {
      setShowDeleteModal(fileId !== null);

      // When opening the modal, ensure page scrolling is disabled
      if (fileId !== null) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    };

    // Create a handler to manage deletion and modal closing
    const handleConfirmDelete = (
      filePublicId: UserFile['public_id'],
      fileName: UserFile['file_name']
    ) => {
      onDelete(filePublicId);
      toggleModal(null);
    };

    return (
      <>
        {showDeleteModal && (
          <DeleteFileModal
            toggleModal={toggleModal}
            handleDelete={handleConfirmDelete}
            filePublicId={file.public_id}
            fileName={file.file_name}
            isLoading={isDeleting}
          />
        )}
        <div className="p-3 rounded-md border border-gray-200 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-accent-dark-700 transition-colors">
          <div className="h-8 w-8 text-gray-600 dark:text-gray-400 flex items-center justify-center">
            {getFileIcon(file.file_type as FileType)}
          </div>
          <div className="flex-1 min-w-0">
            <Text className="font-medium text-gray-700 dark:text-gray-200 truncate">
              {file.file_name}
            </Text>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{formattedSize}</span>
              <span>•</span>
              <span>{formattedDate}</span>
            </div>
          </div>
          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-accent-dark-300 text-gray-700 dark:text-gray-200">
            {file.file_type}
          </span>
          <button
            onClick={() => toggleModal(file.public_id)}
            disabled={isDeleting}
            className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-full transition-colors"
            title={t('remove-file')}
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-t-2 border-red-500 rounded-full animate-spin"></div>
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </>
    );
  }
);

FileItem.displayName = 'FileItem';
