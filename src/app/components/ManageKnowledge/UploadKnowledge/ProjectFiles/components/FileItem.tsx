import { memo } from 'react';
import { Text, TrashIcon } from '@ragenai/common-ui';
import prettyBytes from 'pretty-bytes';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { SupportedFileType } from '@/app/lib/services/fileParser';

type FileItemProps = {
  file: {
    id: string;
    file_name: string;
    file_size: number;
    file_type: string;
    created_at: Date | null;
  };
  onDelete: () => void;
  isDeleting: boolean;
  t: any;
};

export const FileItem = memo(
  ({ file, onDelete, isDeleting, t }: FileItemProps) => {
    const formattedSize = prettyBytes(file.file_size);
    const formattedDate = file.created_at
      ? new Date(file.created_at).toLocaleDateString()
      : '-';

    return (
      <div className="p-3 rounded-md border border-gray-200 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <div className="h-8 w-8 text-gray-400 flex items-center justify-center">
          {getFileIcon(file.file_type as SupportedFileType)}
        </div>
        <div className="flex-1 min-w-0">
          <Text className="font-medium truncate">{file.file_name}</Text>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{formattedSize}</span>
            <span>•</span>
            <span>{formattedDate}</span>
          </div>
        </div>
        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
          {file.file_type}
        </span>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
          title={t('remove-file')}
        >
          {isDeleting ? (
            <div className="w-4 h-4 border-t-2 border-red-500 rounded-full animate-spin"></div>
          ) : (
            <TrashIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    );
  }
);

FileItem.displayName = 'FileItem';
