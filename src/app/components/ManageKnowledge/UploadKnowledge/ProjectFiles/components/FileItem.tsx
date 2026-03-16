import { memo, useState } from 'react';
import prettyBytes from 'pretty-bytes';

import { Text } from '@ragenai/common-ui/Text';
import { TrashIcon } from '@ragenai/common-ui/icons';
import { DeleteFileModal } from '../../../UserFiles/DeleteFileModal';

import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { type FileType, type UserFile } from '@/generated/prisma/browser';
import { logger } from '@/app/lib/utils/logger';

type FileItemProps = {
  file: {
    publicId: string;
    fileName: string;
    fileSize: number;
    fileType: FileType;
    createdAt: Date | null;
  };
  onDelete: (publicFileId: UserFile['publicId']) => void | Promise<void>;
  isDeleting: boolean;
  t: any;
};

export const FileItem = memo(
  ({ file, onDelete, isDeleting, t }: FileItemProps) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const formattedSize = prettyBytes(file.fileSize);
    const formattedDate = file.createdAt
      ? new Date(file.createdAt).toLocaleDateString()
      : '-';

    const handleConfirmDelete = async (filePublicId: UserFile['publicId']) => {
      try {
        await onDelete(filePublicId);
        setShowDeleteModal(false);
      } catch (error) {
        // Modal stays open on error to allow retry
        logger.error({ err: error }, 'Failed to delete file');
      }
    };

    return (
      <>
        <DeleteFileModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleConfirmDelete}
          filePublicId={file.publicId}
          fileName={file.fileName}
          isLoading={isDeleting}
        />
        <div className="p-3 rounded-md border border-gray-200 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-accent-dark-700 transition-colors">
          <div className="h-8 w-8 text-gray-600 dark:text-gray-400 flex items-center justify-center">
            {getFileIcon(file.fileType as FileType)}
          </div>
          <div className="flex-1 min-w-0">
            <Text className="font-medium text-gray-700 dark:text-gray-200 truncate">
              {file.fileName}
            </Text>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{formattedSize}</span>
              <span>•</span>
              <span>{formattedDate}</span>
            </div>
          </div>
          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-accent-dark-300 text-gray-700 dark:text-gray-200">
            {file.fileType}
          </span>
          <button
            onClick={() => setShowDeleteModal(true)}
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
  },
);

FileItem.displayName = 'FileItem';
