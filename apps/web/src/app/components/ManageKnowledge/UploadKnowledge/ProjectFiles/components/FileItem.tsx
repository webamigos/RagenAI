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
    id: string;
    fileName: string;
    fileSize: number;
    fileType: FileType;
    createdAt: Date | null;
  };
  onDelete: (fileId: UserFile['id']) => void | Promise<void>;
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

    const handleConfirmDelete = async (fileId: UserFile['id']) => {
      try {
        await onDelete(fileId);
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
          fileId={file.id}
          fileName={file.fileName}
          isLoading={isDeleting}
        />
        <div className="p-3 rounded-md border border-border flex items-center gap-3 hover:bg-muted dark:hover:bg-paper-800 transition-colors">
          <div className="h-8 w-8 text-muted-foreground flex items-center justify-center">
            {getFileIcon(file.fileType as FileType)}
          </div>
          <div className="flex-1 min-w-0">
            <Text className="font-medium text-foreground truncate">
              {file.fileName}
            </Text>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{formattedSize}</span>
              <span>•</span>
              <span>{formattedDate}</span>
            </div>
          </div>
          <span className="px-2 py-1 text-xs rounded-full bg-muted dark:bg-paper-800 text-foreground">
            {file.fileType}
          </span>
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={isDeleting}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-crimson-50 dark:text-muted-foreground dark:hover:text-destructive dark:hover:bg-crimson-950/40 rounded-full transition-colors"
            title={t('remove-file')}
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-t-2 border-destructive rounded-full animate-spin"></div>
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
